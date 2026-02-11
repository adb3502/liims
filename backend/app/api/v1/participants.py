"""Participant CRUD endpoints with fuzzy search."""

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User
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
    order: str = "desc",
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
