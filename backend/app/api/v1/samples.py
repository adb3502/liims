"""Sample CRUD endpoints with volume tracking, aliquots, and discards."""

import math
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, require_role
from app.database import get_db
from app.models.enums import (
    DiscardRequestStatus,
    SampleStatus,
    SampleType,
    UserRole,
)
from app.models.user import User
from app.schemas.sample import (
    DiscardApprovalRequest,
    DiscardRequestCreate,
    DiscardRequestRead,
    SampleCreate,
    SampleDetail,
    SampleRead,
    SampleStatusUpdate,
    SampleUpdate,
    StatusHistoryRead,
    TransportCreate,
    TransportRead,
    VolumeWithdrawRequest,
)
from app.services.sample import SampleService

router = APIRouter(prefix="/samples", tags=["samples"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)
WRITE_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR,
)


@router.get("", response_model=dict)
async def list_samples(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    participant_id: uuid.UUID | None = None,
    sample_type: SampleType | None = None,
    sample_status: SampleStatus | None = None,
    wave: int | None = None,
    sort: str = "created_at",
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """List samples with pagination, fuzzy search, and filters."""
    svc = SampleService(db)
    samples, total = await svc.list_samples(
        page=page, per_page=per_page, search=search,
        participant_id=participant_id, sample_type=sample_type,
        status=sample_status, wave=wave, sort=sort, order=order,
    )
    return {
        "success": True,
        "data": [SampleRead.model_validate(s).model_dump(mode="json") for s in samples],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_sample(
    data: SampleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Register a new sample."""
    svc = SampleService(db)

    # Get participant code for sample code generation
    from app.models.participant import Participant
    from sqlalchemy import select
    p_result = await db.execute(
        select(Participant.participant_code).where(Participant.id == data.participant_id)
    )
    participant_code = p_result.scalar_one_or_none()
    if participant_code is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participant not found.")

    sample = await svc.create_sample(data, created_by=current_user.id, participant_code=participant_code)
    return {
        "success": True,
        "data": SampleRead.model_validate(sample).model_dump(mode="json"),
    }


# C-04: Discard-request routes MUST come before /{sample_id} to avoid
# FastAPI matching "discard-requests" as a UUID path parameter.

@router.get("/discard-requests", response_model=dict)
async def list_discard_requests(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
    ))],
    request_status: DiscardRequestStatus | None = None,
):
    """List discard requests (lab manager+ only)."""
    svc = SampleService(db)
    requests = await svc.list_discard_requests(status=request_status)
    return {
        "success": True,
        "data": [DiscardRequestRead.model_validate(r).model_dump(mode="json") for r in requests],
    }


@router.post("/discard-requests/{request_id}/approve", response_model=dict)
async def approve_discard(
    request_id: uuid.UUID,
    data: DiscardApprovalRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
    ))],
):
    """Approve or reject a discard request."""
    svc = SampleService(db)
    req = await svc.approve_discard(
        request_id, data.approved, current_user.id, data.rejection_reason,
    )
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Discard request not found.")
    return {
        "success": True,
        "data": DiscardRequestRead.model_validate(req).model_dump(mode="json"),
    }


@router.get("/{sample_id}", response_model=dict)
async def get_sample(
    sample_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Get sample detail with history, aliquots, and processing timer."""
    svc = SampleService(db)
    sample = await svc.get_sample(sample_id)
    if sample is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found.")

    detail = SampleDetail.model_validate(sample)
    detail.status_history = [
        StatusHistoryRead.model_validate(h)
        for h in sorted(sample.status_history, key=lambda h: h.changed_at, reverse=True)
    ]
    detail.aliquots = [
        SampleRead.model_validate(a) for a in sample.aliquots if not a.is_deleted
    ]

    # Processing timer elapsed
    if sample.processing_started_at and sample.status == SampleStatus.PROCESSING:
        elapsed = (datetime.now(timezone.utc) - sample.processing_started_at).total_seconds()
        detail.processing_elapsed_seconds = int(elapsed)

    return {
        "success": True,
        "data": detail.model_dump(mode="json"),
    }


@router.put("/{sample_id}", response_model=dict)
async def update_sample(
    sample_id: uuid.UUID,
    data: SampleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Update sample notes/deviation."""
    svc = SampleService(db)
    sample = await svc.update_sample(sample_id, data, updated_by=current_user.id)
    if sample is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found.")
    return {
        "success": True,
        "data": SampleRead.model_validate(sample).model_dump(mode="json"),
    }


@router.post("/{sample_id}/status", response_model=dict)
async def update_status(
    sample_id: uuid.UUID,
    data: SampleStatusUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Change sample status with transition validation."""
    svc = SampleService(db)
    try:
        sample = await svc.update_status(sample_id, data, changed_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    if sample is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found.")
    return {
        "success": True,
        "data": SampleRead.model_validate(sample).model_dump(mode="json"),
    }


@router.post("/{sample_id}/aliquot", response_model=dict)
async def generate_aliquots(
    sample_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Auto-generate aliquots from rules for this parent sample."""
    svc = SampleService(db)
    aliquots = await svc.auto_generate_aliquots(sample_id, created_by=current_user.id)
    return {
        "success": True,
        "data": [SampleRead.model_validate(a).model_dump(mode="json") for a in aliquots],
        "meta": {"count": len(aliquots)},
    }


@router.post("/{sample_id}/withdraw", response_model=dict)
async def withdraw_volume(
    sample_id: uuid.UUID,
    data: VolumeWithdrawRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Record a volume withdrawal from a sample."""
    svc = SampleService(db)
    try:
        sample = await svc.withdraw_volume(
            sample_id, data.volume_ul, current_user.id, data.reason,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    if sample is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found.")
    return {
        "success": True,
        "data": SampleRead.model_validate(sample).model_dump(mode="json"),
    }


@router.get("/{sample_id}/history", response_model=dict)
async def get_history(
    sample_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Get the full status history timeline for a sample."""
    svc = SampleService(db)
    sample = await svc.get_sample(sample_id)
    if sample is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found.")
    history = sorted(sample.status_history, key=lambda h: h.changed_at, reverse=True)
    return {
        "success": True,
        "data": [StatusHistoryRead.model_validate(h).model_dump(mode="json") for h in history],
    }


# --- Discard requests ---

@router.post("/{sample_id}/discard-request", response_model=dict, status_code=status.HTTP_201_CREATED)
async def request_discard(
    sample_id: uuid.UUID,
    data: DiscardRequestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Create a discard request for a sample."""
    svc = SampleService(db)
    # Verify sample exists
    sample = await svc.get_sample(sample_id)
    if sample is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found.")
    req = await svc.create_discard_request(sample_id, data, requested_by=current_user.id)
    return {
        "success": True,
        "data": DiscardRequestRead.model_validate(req).model_dump(mode="json"),
    }
