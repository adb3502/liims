"""Authentication endpoints: login, logout, refresh, change-password."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_active_user
from app.database import get_db
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest
from app.schemas.user import UserRead
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    if request.client:
        return request.client.host
    return None


@router.post("/login", response_model=dict)
async def login(
    data: LoginRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Authenticate user and return JWT."""
    svc = AuthService(db)
    result = await svc.login(
        email=data.email,
        password=data.password,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    user, token, expires_in = result
    return {
        "success": True,
        "data": {
            "access_token": token,
            "token_type": "bearer",
            "expires_in": expires_in,
            "user": UserRead.model_validate(user).model_dump(mode="json"),
        },
    }


@router.post("/refresh", response_model=dict)
async def refresh_token(
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Refresh the JWT token (silent refresh)."""
    svc = AuthService(db)
    token = getattr(request.state, "access_token", "")
    new_token, expires_in = await svc.refresh(
        current_user=current_user,
        current_token=token,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    return {
        "success": True,
        "data": {
            "access_token": new_token,
            "token_type": "bearer",
            "expires_in": expires_in,
        },
    }


@router.post("/logout", response_model=dict)
async def logout(
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Revoke the current session."""
    svc = AuthService(db)
    token = getattr(request.state, "access_token", "")
    await svc.revoke_session(token, current_user.id)
    await svc.log_audit(
        user_id=current_user.id,
        action=AuditAction.DELETE,
        entity_type="auth",
        entity_id=current_user.id,
        ip_address=_client_ip(request),
        context={"event": "logout"},
    )
    return {"success": True, "data": {"message": "Logged out successfully."}}


@router.post("/change-password", response_model=dict)
async def change_password(
    data: ChangePasswordRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Change the current user's password."""
    svc = AuthService(db)
    success = await svc.change_password(
        user=current_user,
        current_password=data.current_password,
        new_password=data.new_password,
        ip_address=_client_ip(request),
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    return {"success": True, "data": {"message": "Password changed. All sessions revoked."}}


@router.get("/me", response_model=dict)
async def get_me(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    """Get the current authenticated user's profile."""
    return {
        "success": True,
        "data": UserRead.model_validate(current_user).model_dump(mode="json"),
    }
