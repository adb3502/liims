"""User management endpoints (admin only)."""

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user, require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.user import UserService

router = APIRouter(prefix="/users", tags=["users"])


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8)


@router.get("", response_model=dict)
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
    ))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    role: UserRole | None = None,
    is_active: bool | None = None,
    search: str | None = None,
):
    """List users with pagination and filters."""
    svc = UserService(db)
    users, total = await svc.list_users(
        page=page, per_page=per_page, role=role, is_active=is_active, search=search,
    )
    return {
        "success": True,
        "data": [UserRead.model_validate(u).model_dump(mode="json") for u in users],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN))],
):
    """Create a new user account (super admin only)."""
    svc = UserService(db)

    # Check email uniqueness
    existing = await svc.get_user_by_email(data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    user = await svc.create_user(data, created_by=current_user.id)
    return {
        "success": True,
        "data": UserRead.model_validate(user).model_dump(mode="json"),
    }


@router.get("/{user_id}", response_model=dict)
async def get_user(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(
        UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
    ))],
):
    """Get a user by ID."""
    svc = UserService(db)
    user = await svc.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return {
        "success": True,
        "data": UserRead.model_validate(user).model_dump(mode="json"),
    }


@router.put("/{user_id}", response_model=dict)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN))],
):
    """Update a user (super admin only)."""
    svc = UserService(db)
    user = await svc.update_user(user_id, data, updated_by=current_user.id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return {
        "success": True,
        "data": UserRead.model_validate(user).model_dump(mode="json"),
    }


@router.delete("/{user_id}", response_model=dict)
async def delete_user(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN))],
):
    """Soft delete a user (super admin only)."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )

    svc = UserService(db)
    success = await svc.soft_delete_user(user_id, deleted_by=current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return {"success": True, "data": {"message": "User deactivated."}}


@router.post("/{user_id}/reset-password", response_model=dict)
async def reset_password(
    user_id: uuid.UUID,
    data: ResetPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN))],
):
    """Admin password reset (super admin only)."""
    svc = UserService(db)
    success = await svc.reset_password(user_id, data.new_password, reset_by=current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return {"success": True, "data": {"message": "Password reset. User must log in again."}}


@router.put("/{user_id}/activate", response_model=dict)
async def toggle_activate(
    user_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(UserRole.SUPER_ADMIN))],
):
    """Activate or deactivate a user."""
    svc = UserService(db)
    user = await svc.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    update = UserUpdate(is_active=not user.is_active)
    user = await svc.update_user(user_id, update, updated_by=current_user.id)
    action = "activated" if user.is_active else "deactivated"
    return {
        "success": True,
        "data": {"message": f"User {action}.", "is_active": user.is_active},
    }
