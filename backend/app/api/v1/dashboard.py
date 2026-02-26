"""Dashboard analytics endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.services.dashboard import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)


@router.get("/enrollment", response_model=dict)
async def get_enrollment_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    site_code: str | None = Query(None, description="Filter by collection site code (e.g. BBH, RMH)"),
):
    svc = DashboardService(db)
    data = await svc.enrollment_summary(site_code=site_code)
    return {"success": True, "data": data}


@router.get("/inventory", response_model=dict)
async def get_inventory_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = DashboardService(db)
    data = await svc.inventory_summary()
    return {"success": True, "data": data}


@router.get("/field-ops", response_model=dict)
async def get_field_ops_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = DashboardService(db)
    data = await svc.field_ops_summary()
    return {"success": True, "data": data}


@router.get("/instruments", response_model=dict)
async def get_instrument_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = DashboardService(db)
    data = await svc.instrument_summary()
    return {"success": True, "data": data}


@router.get("/quality", response_model=dict)
async def get_quality_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = DashboardService(db)
    data = await svc.quality_summary()
    return {"success": True, "data": data}


@router.get("/overview", response_model=dict)
async def get_overview(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = DashboardService(db)
    data = await svc.overview()
    return {"success": True, "data": data}


@router.get("/summary", response_model=dict)
async def get_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Alias for /overview – kept for backward compatibility."""
    svc = DashboardService(db)
    data = await svc.overview()
    return {"success": True, "data": data}


@router.get("/enrollment-matrix", response_model=dict)
async def get_enrollment_matrix(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Return enrollment counts grouped by site × group_code with targets."""
    svc = DashboardService(db)
    data = await svc.enrollment_matrix()
    return {"success": True, "data": data}
