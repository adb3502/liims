"""Offline sync endpoints for PWA field operations."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.sync import SyncPullRequest, SyncPushRequest
from app.services.sync import SyncService

router = APIRouter(prefix="/sync", tags=["sync"])

SYNC_ROLES = (
    UserRole.SUPER_ADMIN,
    UserRole.LAB_MANAGER,
    UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR,
    UserRole.DATA_ENTRY,
)


@router.post("/push", response_model=dict)
async def sync_push(
    data: SyncPushRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*SYNC_ROLES))],
):
    """Receive a batch of offline mutations and apply them to the server.

    Mutations are processed in order. Conflicts are detected via timestamp
    comparison: if the server entity was updated after the client mutation
    timestamp, the server value wins and the conflict is reported back.
    """
    svc = SyncService(db)
    result = await svc.process_push(
        mutations=[m.model_dump() for m in data.mutations],
        user_id=current_user.id,
        device_id=data.device_id,
    )
    return {
        "success": True,
        "data": result,
    }


@router.post("/pull", response_model=dict)
async def sync_pull(
    data: SyncPullRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*SYNC_ROLES))],
):
    """Pull latest data since a given timestamp for offline caching.

    Returns participants and samples updated since the provided timestamp.
    Limited to 500 participants and 1000 samples per pull.
    """
    svc = SyncService(db)
    result = await svc.get_pull_data(
        user_id=current_user.id,
        since=data.since,
        entity_types=data.entity_types,
    )
    return {
        "success": True,
        "data": result,
    }


@router.get("/status", response_model=dict)
async def sync_status(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*SYNC_ROLES))],
):
    """Get current sync status for the authenticated user."""
    svc = SyncService(db)
    result = await svc.get_sync_status(user_id=current_user.id)
    return {
        "success": True,
        "data": result,
    }
