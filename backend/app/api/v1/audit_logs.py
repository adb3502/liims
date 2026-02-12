"""Audit log query endpoints for admin."""

import math
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, cast, func, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import AuditAction, UserRole
from app.models.user import AuditLog, User

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=dict)
async def list_audit_logs(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER))],
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    user_id: uuid.UUID | None = None,
    action: AuditAction | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
):
    """
    List audit logs with pagination and filters.

    Only accessible to super_admin and lab_manager roles.
    Results are sorted by timestamp descending (newest first).
    """
    # Build base query with left join to User
    stmt = select(AuditLog, User).outerjoin(User, AuditLog.user_id == User.id)

    # Apply filters
    filters = []

    if user_id is not None:
        filters.append(AuditLog.user_id == user_id)

    if action is not None:
        filters.append(AuditLog.action == action)

    if entity_type is not None:
        filters.append(AuditLog.entity_type == entity_type)

    if entity_id is not None:
        filters.append(AuditLog.entity_id == entity_id)

    if date_from is not None:
        filters.append(AuditLog.timestamp >= date_from)

    if date_to is not None:
        filters.append(AuditLog.timestamp <= date_to)

    if search:
        # Search in entity_type, entity_id (as string), or ip_address
        search_pattern = f"%{search}%"
        filters.append(
            or_(
                AuditLog.entity_type.ilike(search_pattern),
                cast(AuditLog.entity_id, String).ilike(search_pattern),
                AuditLog.ip_address.ilike(search_pattern),
            )
        )

    if filters:
        stmt = stmt.where(and_(*filters))

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    # Apply pagination and sort
    stmt = stmt.order_by(AuditLog.timestamp.desc())
    stmt = stmt.limit(per_page).offset((page - 1) * per_page)

    # Execute query
    result = await db.execute(stmt)
    rows = result.all()

    # Convert to dict with user info
    data = []
    for log, user in rows:
        log_dict = {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "action": log.action.value,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id) if log.entity_id else None,
            "old_values": log.old_values,
            "new_values": log.new_values,
            "ip_address": log.ip_address,
            "timestamp": log.timestamp.isoformat(),
            "additional_context": log.additional_context,
        }

        # Add user info if available
        if user:
            log_dict["user_email"] = user.email
            log_dict["user_full_name"] = user.full_name

        data.append(log_dict)

    return {
        "success": True,
        "data": data,
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }
