"""Field event CRUD, participant management, check-in, and bulk digitization endpoints."""

import math
import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import FieldEventStatus, UserRole
from app.models.user import User
from app.schemas.field_ops import (
    BulkDigitizeRequest,
    CheckInRequest,
    EventParticipantBulkAdd,
    EventParticipantRead,
    FieldEventCreate,
    FieldEventDetail,
    FieldEventRead,
    FieldEventUpdate,
)
from app.services.field_ops import FieldEventService

router = APIRouter(prefix="/field-events", tags=["field-events"])

READ_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.PI_RESEARCHER,
)
WRITE_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
    UserRole.FIELD_COORDINATOR,
)


@router.get("", response_model=dict)
async def list_field_events(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*READ_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    event_status: FieldEventStatus | None = None,
    collection_site_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort: str = "event_date",
    order: str = "desc",
):
    """List field events with pagination and filters."""
    svc = FieldEventService(db)
    events, total = await svc.list_events(
        page=page, per_page=per_page, status=event_status,
        collection_site_id=collection_site_id,
        date_from=date_from, date_to=date_to,
        sort=sort, order=order,
    )
    return {
        "success": True,
        "data": [FieldEventRead.model_validate(e).model_dump(mode="json") for e in events],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_field_event(
    data: FieldEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Create a new field event."""
    svc = FieldEventService(db)
    event = await svc.create_event(data, created_by=current_user.id)
    return {
        "success": True,
        "data": FieldEventRead.model_validate(event).model_dump(mode="json"),
    }


@router.get("/{event_id}", response_model=dict)
async def get_field_event(
    event_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*READ_ROLES))],
):
    """Get field event detail with participants."""
    svc = FieldEventService(db)
    event = await svc.get_event(event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Field event not found.")

    # Build detail with participant roster including participant_code
    roster = await svc.get_event_roster(event_id)
    detail = FieldEventDetail.model_validate(event)
    detail.event_participants = [
        EventParticipantRead(**row) for row in roster
    ]

    return {
        "success": True,
        "data": detail.model_dump(mode="json"),
    }


@router.put("/{event_id}", response_model=dict)
async def update_field_event(
    event_id: uuid.UUID,
    data: FieldEventUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Update a field event (with status transition validation)."""
    svc = FieldEventService(db)
    try:
        event = await svc.update_event(event_id, data, updated_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Field event not found.")
    return {
        "success": True,
        "data": FieldEventRead.model_validate(event).model_dump(mode="json"),
    }


@router.post("/{event_id}/participants", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_participants(
    event_id: uuid.UUID,
    data: EventParticipantBulkAdd,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Bulk-add participants to a field event."""
    svc = FieldEventService(db)
    try:
        added = await svc.add_participants(event_id, data.participant_ids, added_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": [EventParticipantRead.model_validate(a).model_dump(mode="json") for a in added],
        "meta": {"added_count": len(added)},
    }


@router.post("/{event_id}/check-in", response_model=dict)
async def check_in_participant(
    event_id: uuid.UUID,
    data: CheckInRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Record check-in for a participant at a field event."""
    svc = FieldEventService(db)
    fep = await svc.check_in_participant(event_id, data, recorded_by=current_user.id)
    if fep is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Participant not found in this event. Add them first.",
        )
    return {
        "success": True,
        "data": EventParticipantRead.model_validate(fep).model_dump(mode="json"),
    }


@router.post("/{event_id}/bulk-update", response_model=dict)
async def bulk_digitize(
    event_id: uuid.UUID,
    data: BulkDigitizeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Bulk update participant records from paper forms (digitization)."""
    svc = FieldEventService(db)
    try:
        updated = await svc.bulk_digitize(event_id, data.items, recorded_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": [EventParticipantRead.model_validate(u).model_dump(mode="json") for u in updated],
        "meta": {"updated_count": len(updated)},
    }
