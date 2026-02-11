"""ICC (Immunocytochemistry) workflow endpoints."""

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import IccStatus, UserRole
from app.models.user import User
from app.schemas.instrument import (
    IccProcessingCreate,
    IccProcessingRead,
    IccProcessingUpdate,
)
from app.services.icc import IccService

router = APIRouter(prefix="/icc", tags=["icc"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)
WRITE_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
)


def _paginate_meta(page: int, per_page: int, total: int) -> dict:
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": math.ceil(total / per_page) if per_page else 0,
    }


@router.get("", response_model=dict)
async def list_icc(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    sample_id: uuid.UUID | None = None,
    participant_id: uuid.UUID | None = None,
    status_filter: IccStatus | None = Query(None, alias="status"),
    sort: str = "created_at",
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    svc = IccService(db)
    items, total = await svc.list_icc(
        page=page, per_page=per_page,
        sample_id=sample_id, participant_id=participant_id,
        status=status_filter, sort=sort, order=order,
    )
    return {
        "success": True,
        "data": [IccProcessingRead(**item).model_dump(mode="json") for item in items],
        "meta": _paginate_meta(page, per_page, total),
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_icc(
    data: IccProcessingCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = IccService(db)
    try:
        icc = await svc.create_icc(data, created_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    detail = await svc.get_icc(icc.id)
    return {
        "success": True,
        "data": IccProcessingRead(**detail).model_dump(mode="json"),
    }


@router.get("/{icc_id}", response_model=dict)
async def get_icc(
    icc_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = IccService(db)
    detail = await svc.get_icc(icc_id)
    if detail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ICC processing record not found.")
    return {
        "success": True,
        "data": IccProcessingRead(**detail).model_dump(mode="json"),
    }


@router.put("/{icc_id}", response_model=dict)
async def update_icc(
    icc_id: uuid.UUID,
    data: IccProcessingUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = IccService(db)
    try:
        icc = await svc.update_icc(icc_id, data, updated_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    if icc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ICC processing record not found.")
    detail = await svc.get_icc(icc.id)
    return {
        "success": True,
        "data": IccProcessingRead(**detail).model_dump(mode="json"),
    }


@router.post("/{icc_id}/advance", response_model=dict)
async def advance_icc_status(
    icc_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Advance ICC processing to the next workflow step."""
    svc = IccService(db)
    try:
        icc = await svc.advance_status(icc_id, advanced_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    detail = await svc.get_icc(icc.id)
    return {
        "success": True,
        "data": IccProcessingRead(**detail).model_dump(mode="json"),
    }
