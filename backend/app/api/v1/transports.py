"""Transport tracking endpoints."""

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.sample import TransportCreate, TransportRead
from app.services.sample import SampleService

router = APIRouter(prefix="/transports", tags=["transports"])


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_transport(
    data: TransportCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
        UserRole.LAB_TECHNICIAN, UserRole.FIELD_COORDINATOR,
    ))],
):
    """Record a sample transport."""
    svc = SampleService(db)
    transport = await svc.create_transport(data, recorded_by=current_user.id)
    return {
        "success": True,
        "data": TransportRead.model_validate(transport).model_dump(mode="json"),
    }


@router.get("", response_model=dict)
async def list_transports(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
        UserRole.LAB_TECHNICIAN, UserRole.FIELD_COORDINATOR,
    ))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List transport records."""
    svc = SampleService(db)
    transports, total = await svc.list_transports(page=page, per_page=per_page)
    return {
        "success": True,
        "data": [TransportRead.model_validate(t).model_dump(mode="json") for t in transports],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }
