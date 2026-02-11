"""Storage management endpoints: Freezers, Racks, Boxes, Positions, Temperature."""

import math
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import BoxType, FreezerType, UserRole
from app.models.user import User
from app.schemas.storage import (
    AutoAssignRequest,
    BoxCreate,
    BoxDetail,
    BoxRead,
    BoxUpdate,
    BulkAssignRequest,
    ConsolidateRequest,
    FreezerCreate,
    FreezerRead,
    FreezerUpdate,
    PositionAssign,
    PositionRead,
    RackBatchCreate,
    RackCreate,
    RackRead,
    StorageSearchResult,
    TempEventCreate,
    TempEventRead,
    TempEventResolve,
)
from app.services.storage import StorageService

router = APIRouter(prefix="/storage", tags=["storage"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)
WRITE_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
)
ADMIN_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
)


# ── Freezers ─────────────────────────────────────────────────────────

@router.get("/freezers", response_model=dict)
async def list_freezers(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    freezer_type: FreezerType | None = None,
    is_active: bool | None = None,
):
    """List freezers with utilization stats."""
    svc = StorageService(db)
    items, total = await svc.list_freezers(
        page=page, per_page=per_page,
        freezer_type=freezer_type, is_active=is_active,
    )
    return {
        "success": True,
        "data": [FreezerRead(**item).model_dump(mode="json") for item in items],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.post("/freezers", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_freezer(
    data: FreezerCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Create a new freezer."""
    svc = StorageService(db)
    freezer = await svc.create_freezer(data, created_by=current_user.id)
    detail = await svc.get_freezer(freezer.id)
    return {
        "success": True,
        "data": FreezerRead(**detail).model_dump(mode="json"),
    }


@router.get("/freezers/{freezer_id}", response_model=dict)
async def get_freezer(
    freezer_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Get freezer detail with utilization stats."""
    svc = StorageService(db)
    detail = await svc.get_freezer(freezer_id)
    if detail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Freezer not found.")
    return {
        "success": True,
        "data": FreezerRead(**detail).model_dump(mode="json"),
    }


@router.put("/freezers/{freezer_id}", response_model=dict)
async def update_freezer(
    freezer_id: uuid.UUID,
    data: FreezerUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Update freezer details."""
    svc = StorageService(db)
    freezer = await svc.update_freezer(freezer_id, data, updated_by=current_user.id)
    if freezer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Freezer not found.")
    detail = await svc.get_freezer(freezer.id)
    return {
        "success": True,
        "data": FreezerRead(**detail).model_dump(mode="json"),
    }


@router.delete("/freezers/{freezer_id}", response_model=dict)
async def delete_freezer(
    freezer_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Soft-delete / deactivate a freezer."""
    svc = StorageService(db)
    freezer = await svc.deactivate_freezer(freezer_id, deactivated_by=current_user.id)
    if freezer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Freezer not found.")
    return {"success": True, "data": {"id": str(freezer.id), "is_deleted": True}}


# ── Racks ─────────────────────────────────────────────────────────────

@router.get("/freezers/{freezer_id}/racks", response_model=dict)
async def list_racks(
    freezer_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """List racks for a freezer."""
    svc = StorageService(db)
    racks = await svc.list_racks_for_freezer(freezer_id)
    return {
        "success": True,
        "data": [RackRead.model_validate(r).model_dump(mode="json") for r in racks],
        "meta": {"count": len(racks)},
    }


@router.post("/freezers/{freezer_id}/racks", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_rack(
    freezer_id: uuid.UUID,
    data: RackCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Create a single rack in a freezer."""
    svc = StorageService(db)
    rack = await svc.create_rack(freezer_id, data, created_by=current_user.id)
    return {
        "success": True,
        "data": RackRead.model_validate(rack).model_dump(mode="json"),
    }


@router.post("/freezers/{freezer_id}/racks/batch", response_model=dict, status_code=status.HTTP_201_CREATED)
async def batch_create_racks(
    freezer_id: uuid.UUID,
    data: RackBatchCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Batch-create multiple racks for a freezer."""
    svc = StorageService(db)
    racks = await svc.auto_create_racks(
        freezer_id, data.count, data.label_prefix, created_by=current_user.id,
    )
    return {
        "success": True,
        "data": [RackRead.model_validate(r).model_dump(mode="json") for r in racks],
        "meta": {"count": len(racks)},
    }


# ── Boxes ─────────────────────────────────────────────────────────────

@router.get("/boxes", response_model=dict)
async def list_boxes(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    rack_id: uuid.UUID | None = None,
    freezer_id: uuid.UUID | None = None,
    group_code: str | None = None,
    has_space: bool | None = None,
):
    """List storage boxes with occupancy info."""
    svc = StorageService(db)
    items, total = await svc.list_boxes(
        page=page, per_page=per_page,
        rack_id=rack_id, freezer_id=freezer_id,
        group_code=group_code, has_space=has_space,
    )
    return {
        "success": True,
        "data": [BoxRead(**item).model_dump(mode="json") for item in items],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.post("/boxes", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_box(
    data: BoxCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Create a storage box (auto-creates position grid)."""
    svc = StorageService(db)
    box = await svc.create_box(data, created_by=current_user.id)
    detail = await svc.get_box_detail(box.id)
    return {
        "success": True,
        "data": BoxDetail(**detail).model_dump(mode="json"),
    }


@router.get("/boxes/{box_id}", response_model=dict)
async def get_box_detail(
    box_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Get box detail with all positions and sample info."""
    svc = StorageService(db)
    detail = await svc.get_box_detail(box_id)
    if detail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Storage box not found.")
    return {
        "success": True,
        "data": BoxDetail(**detail).model_dump(mode="json"),
    }


@router.put("/boxes/{box_id}", response_model=dict)
async def update_box(
    box_id: uuid.UUID,
    data: BoxUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Update a storage box."""
    svc = StorageService(db)
    box = await svc.update_box(box_id, data, updated_by=current_user.id)
    if box is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Storage box not found.")
    detail = await svc.get_box_detail(box.id)
    return {
        "success": True,
        "data": BoxDetail(**detail).model_dump(mode="json"),
    }


# ── Positions ─────────────────────────────────────────────────────────

@router.post("/positions/{position_id}/assign", response_model=dict)
async def assign_sample(
    position_id: uuid.UUID,
    data: PositionAssign,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Assign a sample to a storage position (uses row-level lock)."""
    svc = StorageService(db)
    try:
        position = await svc.assign_sample(
            position_id, data.sample_id, assigned_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": PositionRead.model_validate(position).model_dump(mode="json"),
    }


@router.post("/positions/{position_id}/unassign", response_model=dict)
async def unassign_sample(
    position_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Remove a sample from a storage position."""
    svc = StorageService(db)
    try:
        position = await svc.unassign_sample(
            position_id, unassigned_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": PositionRead.model_validate(position).model_dump(mode="json"),
    }


@router.post("/auto-assign", response_model=dict)
async def auto_assign(
    data: AutoAssignRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Auto-assign a sample to the best available position in a freezer."""
    svc = StorageService(db)
    try:
        position = await svc.auto_assign_sample(
            data.sample_id, data.freezer_id, data.group_code,
            assigned_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": PositionRead.model_validate(position).model_dump(mode="json"),
    }


@router.post("/bulk-assign", response_model=dict)
async def bulk_assign(
    data: BulkAssignRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Batch-assign multiple samples to positions."""
    svc = StorageService(db)
    try:
        positions = await svc.bulk_assign_positions(
            data.assignments, assigned_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": [PositionRead.model_validate(p).model_dump(mode="json") for p in positions],
        "meta": {"count": len(positions)},
    }


@router.post("/boxes/{box_id}/consolidate", response_model=dict)
async def consolidate_box(
    box_id: uuid.UUID,
    data: ConsolidateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Consolidate samples from source box into target box (e.g. -80 to -150)."""
    svc = StorageService(db)
    try:
        result = await svc.consolidate_box(
            box_id, data.target_box_id, consolidated_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {"success": True, "data": result}


# ── Temperature Events ────────────────────────────────────────────────

@router.get("/freezers/{freezer_id}/temperature", response_model=dict)
async def list_temperature_events(
    freezer_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
):
    """List temperature events for a freezer."""
    svc = StorageService(db)
    events, total = await svc.list_temperature_events(
        freezer_id, page=page, per_page=per_page,
        start_date=start_date, end_date=end_date,
    )
    return {
        "success": True,
        "data": [TempEventRead.model_validate(e).model_dump(mode="json") for e in events],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.post("/freezers/{freezer_id}/temperature", response_model=dict, status_code=status.HTTP_201_CREATED)
async def record_temperature_event(
    freezer_id: uuid.UUID,
    data: TempEventCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Record a temperature event for a freezer."""
    svc = StorageService(db)
    event = await svc.record_temperature_event(
        freezer_id, data, reported_by=current_user.id,
    )
    return {
        "success": True,
        "data": TempEventRead.model_validate(event).model_dump(mode="json"),
    }


@router.put("/temperature-events/{event_id}/resolve", response_model=dict)
async def resolve_temperature_event(
    event_id: uuid.UUID,
    data: TempEventResolve,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Add resolution notes to a temperature event."""
    svc = StorageService(db)
    event = await svc.resolve_temperature_event(
        event_id, data, resolved_by=current_user.id,
    )
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Temperature event not found.")
    return {
        "success": True,
        "data": TempEventRead.model_validate(event).model_dump(mode="json"),
    }


# ── Search ────────────────────────────────────────────────────────────

@router.get("/search", response_model=dict)
async def search_storage(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    sample_code: str = Query(min_length=1),
):
    """Search for a sample's storage location."""
    svc = StorageService(db)
    results = await svc.search_storage(sample_code)
    return {
        "success": True,
        "data": [StorageSearchResult(**r).model_dump(mode="json") for r in results],
        "meta": {"count": len(results)},
    }
