"""Notification endpoints."""

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user
from app.database import get_db
from app.models.enums import NotificationSeverity, NotificationType
from app.models.user import User
from app.schemas.notification import NotificationRead
from app.services.notification import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=dict)
async def list_notifications(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    notification_type: NotificationType | None = None,
    severity: NotificationSeverity | None = None,
    is_read: bool | None = None,
):
    """List notifications for the current user."""
    svc = NotificationService(db)
    notifications, total = await svc.list_notifications(
        user_id=current_user.id,
        user_role=current_user.role,
        page=page, per_page=per_page,
        notification_type=notification_type,
        severity=severity, is_read=is_read,
    )
    return {
        "success": True,
        "data": [NotificationRead.model_validate(n).model_dump(mode="json") for n in notifications],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.get("/unread-count", response_model=dict)
async def unread_count(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Get the unread notification count (for bell icon badge)."""
    svc = NotificationService(db)
    count = await svc.get_unread_count(current_user.id, current_user.role)
    return {"success": True, "data": {"unread_count": count}}


@router.put("/{notification_id}/read", response_model=dict)
async def mark_read(
    notification_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Mark a notification as read."""
    svc = NotificationService(db)
    success = await svc.mark_read(notification_id, current_user.id)
    if not success:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found.")
    return {"success": True, "data": {"message": "Marked as read."}}


@router.put("/mark-all-read", response_model=dict)
async def mark_all_read(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Mark all notifications as read."""
    svc = NotificationService(db)
    count = await svc.mark_all_read(current_user.id, current_user.role)
    return {"success": True, "data": {"marked_count": count}}
