"""System settings endpoints (super_admin only)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.system_setting import SystemSettingRead, SystemSettingUpdate
from app.services.system_setting import SystemSettingService

router = APIRouter(prefix="/settings", tags=["settings"])

ADMIN_ROLES = (UserRole.SUPER_ADMIN,)


@router.get("", response_model=dict)
async def list_settings(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """List all system settings grouped by category."""
    svc = SystemSettingService(db)
    grouped = await svc.get_all_grouped()
    result = []
    for group in grouped:
        result.append({
            "category": group["category"],
            "settings": [
                SystemSettingRead.model_validate(s).model_dump(mode="json")
                for s in group["settings"]
            ],
        })
    return {"success": True, "data": result}


@router.get("/{category}", response_model=dict)
async def get_settings_by_category(
    category: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Get all settings in a specific category."""
    svc = SystemSettingService(db)
    settings = await svc.get_settings_by_category(category)
    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No settings found for category '{category}'.",
        )
    return {
        "success": True,
        "data": [
            SystemSettingRead.model_validate(s).model_dump(mode="json")
            for s in settings
        ],
    }


@router.put("/{category}/{key}", response_model=dict)
async def update_setting(
    category: str,
    key: str,
    body: SystemSettingUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Update a system setting value. Validates type and creates audit log."""
    svc = SystemSettingService(db)
    try:
        setting = await svc.update_setting(
            category=category,
            key=key,
            new_value=body.value,
            updated_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    if setting is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Setting '{category}/{key}' not found.",
        )

    return {
        "success": True,
        "data": SystemSettingRead.model_validate(setting).model_dump(mode="json"),
    }
