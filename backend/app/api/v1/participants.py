"""Participant CRUD endpoints with fuzzy search."""

import logging
import math
import re
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, require_role
from app.database import get_db
from app.models.enums import AgeGroup, AuditAction, EnrollmentSource, Sex, UserRole
from app.models.participant import CollectionSite, Participant
from app.models.user import AuditLog, User
from app.schemas.participant import (
    ConsentCreate,
    ConsentRead,
    ConsentUpdate,
    ParticipantCreate,
    ParticipantDetail,
    ParticipantRead,
    ParticipantUpdate,
    CollectionSiteRead,
)
from app.services.participant import ParticipantService

logger = logging.getLogger(__name__)

# Regex for participant code format: {age_group_digit}{sex_letter}-{3-digit_number}
# e.g. "1A-001", "3B-042", "5A-999"
_PARTICIPANT_CODE_RE = re.compile(r"^([1-5])([AB])-(\d{3})$")

_SEX_LETTER_TO_ENUM = {"A": Sex.MALE, "B": Sex.FEMALE}


class BulkCreateRequest(BaseModel):
    start_code: str = Field(
        min_length=6, max_length=7,
        description="Start participant code, e.g. '1A-001'",
    )
    end_code: str = Field(
        min_length=6, max_length=7,
        description="End participant code (inclusive), e.g. '1A-050'",
    )
    collection_site_id: uuid.UUID


router = APIRouter(prefix="/participants", tags=["participants"])

# Roles allowed to create participants
CREATE_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
    UserRole.DATA_ENTRY, UserRole.FIELD_COORDINATOR,
)
# Roles allowed to view participants
VIEW_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.DATA_ENTRY, UserRole.FIELD_COORDINATOR,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)


@router.get("", response_model=dict)
async def list_participants(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*VIEW_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    collection_site_id: uuid.UUID | None = None,
    age_group: int | None = None,
    sex: str | None = None,
    wave: int | None = None,
    sort: str = "created_at",
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """List participants with pagination, fuzzy search, and filters."""
    svc = ParticipantService(db)
    participants, total = await svc.list_participants(
        page=page, per_page=per_page, search=search,
        collection_site_id=collection_site_id,
        age_group=age_group, sex=sex, wave=wave,
        sort=sort, order=order,
    )
    return {
        "success": True,
        "data": [
            ParticipantRead.model_validate(p).model_dump(mode="json")
            for p in participants
        ],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_participant(
    data: ParticipantCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*CREATE_ROLES))],
):
    """Create a new participant (manual enrollment)."""
    svc = ParticipantService(db)
    participant = await svc.create_participant(data, created_by=current_user.id)
    return {
        "success": True,
        "data": ParticipantRead.model_validate(participant).model_dump(mode="json"),
    }


@router.post("/bulk-create", response_model=dict, status_code=status.HTTP_201_CREATED)
async def bulk_create_participants(
    data: BulkCreateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*CREATE_ROLES))],
):
    """Bulk-create participants in a code range, e.g. 1A-001 to 1A-050.

    Skips codes that already exist (duplicates). The start and end codes must
    share the same age-group digit and sex letter (e.g. both '1A-…').
    """
    start_match = _PARTICIPANT_CODE_RE.match(data.start_code.strip().upper())
    end_match = _PARTICIPANT_CODE_RE.match(data.end_code.strip().upper())

    if not start_match:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Invalid start_code '{data.start_code}'. Expected format: '1A-001'.",
        )
    if not end_match:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Invalid end_code '{data.end_code}'. Expected format: '1A-050'.",
        )

    start_ag, start_sex_letter, start_num_str = start_match.groups()
    end_ag, end_sex_letter, end_num_str = end_match.groups()

    if start_ag != end_ag or start_sex_letter != end_sex_letter:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "start_code and end_code must have the same age-group digit and sex letter "
            f"(e.g. both '1A-…'). Got '{data.start_code}' and '{data.end_code}'.",
        )

    start_num = int(start_num_str)
    end_num = int(end_num_str)

    if end_num < start_num:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"end_code number ({end_num}) must be >= start_code number ({start_num}).",
        )

    age_group_int = int(start_ag)
    try:
        age_group_enum = AgeGroup(age_group_int)
    except ValueError:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Invalid age group digit '{start_ag}'. Must be 1-5.",
        )

    sex_enum = _SEX_LETTER_TO_ENUM[start_sex_letter]
    group_code = f"{start_ag}{start_sex_letter}"

    # Validate collection site exists
    site_result = await db.execute(
        select(CollectionSite).where(
            CollectionSite.id == data.collection_site_id,
            CollectionSite.is_deleted == False,  # noqa: E712
        )
    )
    if site_result.scalar_one_or_none() is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Collection site '{data.collection_site_id}' not found.",
        )

    # Fetch existing codes in range to detect duplicates without a DB round-trip per code
    codes_to_create = [f"{group_code}-{n:03d}" for n in range(start_num, end_num + 1)]
    existing_result = await db.execute(
        select(Participant.participant_code).where(
            Participant.participant_code.in_(codes_to_create),
        )
    )
    existing_codes: set[str] = {row[0] for row in existing_result.all()}

    created_count = 0
    skipped_count = 0
    now = datetime.now(timezone.utc)

    for num in range(start_num, end_num + 1):
        code = f"{group_code}-{num:03d}"
        if code in existing_codes:
            skipped_count += 1
            continue

        new_id = uuid.uuid4()
        participant = Participant(
            id=new_id,
            participant_code=code,
            group_code=group_code,
            participant_number=num,
            age_group=age_group_enum,
            sex=sex_enum,
            collection_site_id=data.collection_site_id,
            enrollment_date=now,
            enrollment_source=EnrollmentSource.BULK_IMPORT,
            wave=1,
            created_by=current_user.id,
        )
        db.add(participant)
        db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=current_user.id,
            action=AuditAction.CREATE,
            entity_type="participant",
            entity_id=new_id,
            new_values={"participant_code": code, "source": "bulk_create"},
        ))
        created_count += 1

    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Bulk create failed due to a conflict: {str(exc.orig)[:300]}",
        )

    return {
        "success": True,
        "data": {
            "created": created_count,
            "skipped": skipped_count,
            "errors": [],
        },
    }


@router.get("/{participant_id}", response_model=dict)
async def get_participant(
    participant_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*VIEW_ROLES))],
):
    """Get a participant with full detail (consents, sample counts, site)."""
    svc = ParticipantService(db)
    participant = await svc.get_participant(participant_id)
    if participant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participant not found.")

    sample_counts = await svc.get_sample_counts(participant_id)

    detail = ParticipantDetail.model_validate(participant)
    detail.sample_counts = sample_counts
    if participant.collection_site:
        detail.collection_site = CollectionSiteRead.model_validate(
            participant.collection_site
        )
    detail.consents = [
        ConsentRead.model_validate(c)
        for c in participant.consents
        if not c.is_deleted
    ]

    return {
        "success": True,
        "data": detail.model_dump(mode="json"),
    }


@router.put("/{participant_id}", response_model=dict)
async def update_participant(
    participant_id: uuid.UUID,
    data: ParticipantUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.DATA_ENTRY,
    ))],
):
    """Update a participant."""
    svc = ParticipantService(db)
    participant = await svc.update_participant(
        participant_id, data, updated_by=current_user.id
    )
    if participant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participant not found.")
    return {
        "success": True,
        "data": ParticipantRead.model_validate(participant).model_dump(mode="json"),
    }


@router.delete("/{participant_id}", response_model=dict)
async def delete_participant(
    participant_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
    ))],
):
    """Soft-delete a participant (manager+ only)."""
    svc = ParticipantService(db)
    success = await svc.soft_delete_participant(participant_id, deleted_by=current_user.id)
    if not success:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participant not found.")
    return {"success": True, "data": {"message": "Participant deleted."}}


# --- Consent sub-routes ---

@router.get("/{participant_id}/consents", response_model=dict)
async def list_consents(
    participant_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*VIEW_ROLES))],
):
    """List all consents for a participant."""
    svc = ParticipantService(db)
    consents = await svc.list_consents(participant_id)
    return {
        "success": True,
        "data": [ConsentRead.model_validate(c).model_dump(mode="json") for c in consents],
    }


@router.post(
    "/{participant_id}/consents",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
)
async def create_consent(
    participant_id: uuid.UUID,
    data: ConsentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*CREATE_ROLES))],
):
    """Record a consent for a participant."""
    svc = ParticipantService(db)

    # Verify participant exists
    participant = await svc.get_participant(participant_id)
    if participant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participant not found.")

    consent = await svc.create_consent(participant_id, data, created_by=current_user.id)
    return {
        "success": True,
        "data": ConsentRead.model_validate(consent).model_dump(mode="json"),
    }


@router.put("/consents/{consent_id}", response_model=dict)
async def update_consent(
    consent_id: uuid.UUID,
    data: ConsentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.DATA_ENTRY,
    ))],
):
    """Update a consent record (e.g., record withdrawal)."""
    svc = ParticipantService(db)
    consent = await svc.update_consent(consent_id, data, updated_by=current_user.id)
    if consent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Consent not found.")
    return {
        "success": True,
        "data": ConsentRead.model_validate(consent).model_dump(mode="json"),
    }
