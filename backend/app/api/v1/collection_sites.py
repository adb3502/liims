"""Collection site CRUD endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.participant import (
    CollectionSiteCreate,
    CollectionSiteRead,
    CollectionSiteUpdate,
)
from app.services.participant import CollectionSiteService

router = APIRouter(prefix="/collection-sites", tags=["collection-sites"])


@router.get("", response_model=dict)
async def list_sites(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    is_active: bool | None = None,
):
    """List all collection sites."""
    svc = CollectionSiteService(db)
    sites = await svc.list_sites(is_active=is_active)
    return {
        "success": True,
        "data": [CollectionSiteRead.model_validate(s).model_dump(mode="json") for s in sites],
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_site(
    data: CollectionSiteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN))],
):
    """Create a new collection site (super admin only)."""
    svc = CollectionSiteService(db)

    # Check code uniqueness
    existing = await svc.get_site_by_code(data.code)
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A collection site with this code already exists.",
        )

    site = await svc.create_site(
        name=data.name,
        code=data.code,
        range_start=data.participant_range_start,
        range_end=data.participant_range_end,
        city=data.city,
        address=data.address,
        created_by=current_user.id,
    )
    return {
        "success": True,
        "data": CollectionSiteRead.model_validate(site).model_dump(mode="json"),
    }


@router.get("/{site_id}", response_model=dict)
async def get_site(
    site_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Get a collection site by ID."""
    svc = CollectionSiteService(db)
    site = await svc.get_site(site_id)
    if site is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection site not found.")
    return {
        "success": True,
        "data": CollectionSiteRead.model_validate(site).model_dump(mode="json"),
    }


@router.put("/{site_id}", response_model=dict)
async def update_site(
    site_id: uuid.UUID,
    data: CollectionSiteUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
    ))],
):
    """Update a collection site."""
    svc = CollectionSiteService(db)
    update_kwargs = data.model_dump(exclude_unset=True)
    if "participant_range_start" in update_kwargs:
        update_kwargs["participant_range_start"] = data.participant_range_start
    if "participant_range_end" in update_kwargs:
        update_kwargs["participant_range_end"] = data.participant_range_end
    site = await svc.update_site(site_id, **update_kwargs)
    if site is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection site not found.")
    return {
        "success": True,
        "data": CollectionSiteRead.model_validate(site).model_dump(mode="json"),
    }
