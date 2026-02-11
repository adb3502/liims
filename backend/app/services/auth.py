"""Authentication service: login, token management, sessions."""

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_token,
    verify_password,
)
from app.models.enums import AuditAction
from app.models.user import AuditLog, User, UserSession

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def authenticate_user(self, email: str, password: str) -> User | None:
        """Validate email/password and return user or None."""
        result = await self.db.execute(
            select(User).where(
                User.email == email,
                User.is_deleted == False,  # noqa: E712
            )
        )
        user = result.scalar_one_or_none()
        if user is None:
            return None
        if not user.is_active:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user

    async def create_session(
        self,
        user: User,
        token: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Create a new session record. Enforce max concurrent sessions."""
        # Count active (non-expired, non-revoked) sessions
        now = datetime.now(timezone.utc)
        count_result = await self.db.execute(
            select(func.count(UserSession.id)).where(
                UserSession.user_id == user.id,
                UserSession.expires_at > now,
                UserSession.revoked_at.is_(None),
            )
        )
        active_count = count_result.scalar_one()

        # If at limit, revoke the oldest session
        if active_count >= settings.MAX_CONCURRENT_SESSIONS:
            oldest_result = await self.db.execute(
                select(UserSession)
                .where(
                    UserSession.user_id == user.id,
                    UserSession.expires_at > now,
                    UserSession.revoked_at.is_(None),
                )
                .order_by(UserSession.created_at.asc())
                .limit(1)
            )
            oldest = oldest_result.scalar_one_or_none()
            if oldest:
                oldest.revoked_at = now

        session = UserSession(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=hash_token(token),
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=now + timedelta(hours=settings.JWT_EXPIRY_HOURS),
        )
        self.db.add(session)

        # Update last_login
        user.last_login = now

    async def validate_session(self, token: str, user_id: uuid.UUID) -> bool:
        """Check that the token's session is active and not revoked."""
        token_h = hash_token(token)
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.token_hash == token_h,
                UserSession.expires_at > now,
                UserSession.revoked_at.is_(None),
            )
        )
        return result.scalar_one_or_none() is not None

    async def revoke_session(self, token: str, user_id: uuid.UUID) -> None:
        """Revoke a specific session by token."""
        token_h = hash_token(token)
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.token_hash == token_h,
            )
        )
        session = result.scalar_one_or_none()
        if session:
            session.revoked_at = datetime.now(timezone.utc)

    async def revoke_all_sessions(self, user_id: uuid.UUID) -> None:
        """Revoke all sessions for a user (e.g., on password change)."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
        )
        for session in result.scalars().all():
            session.revoked_at = now

    async def log_audit(
        self,
        user_id: uuid.UUID | None,
        action: AuditAction,
        entity_type: str,
        entity_id: uuid.UUID | None = None,
        old_values: dict | None = None,
        new_values: dict | None = None,
        ip_address: str | None = None,
        context: dict | None = None,
    ) -> None:
        """Create an audit log entry."""
        entry = AuditLog(
            id=uuid.uuid4(),
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address,
            additional_context=context,
        )
        self.db.add(entry)

    async def login(
        self,
        email: str,
        password: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[User, str, int] | None:
        """Full login flow: authenticate, create session, audit log.

        Returns (user, access_token, expires_in_seconds) or None.
        """
        user = await self.authenticate_user(email, password)
        if user is None:
            # Log failed attempt
            await self.log_audit(
                user_id=None,
                action=AuditAction.VIEW,
                entity_type="auth",
                ip_address=ip_address,
                context={"event": "login_failed", "email": email},
            )
            return None

        expires_seconds = settings.JWT_EXPIRY_HOURS * 3600
        token = create_access_token(user.id)
        await self.create_session(user, token, ip_address, user_agent)
        await self.log_audit(
            user_id=user.id,
            action=AuditAction.CREATE,
            entity_type="auth",
            entity_id=user.id,
            ip_address=ip_address,
            context={"event": "login"},
        )
        return user, token, expires_seconds

    async def refresh(
        self,
        current_user: User,
        current_token: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[str, int]:
        """Refresh token: revoke old session, create new one."""
        await self.revoke_session(current_token, current_user.id)
        expires_seconds = settings.JWT_EXPIRY_HOURS * 3600
        new_token = create_access_token(current_user.id)
        await self.create_session(current_user, new_token, ip_address, user_agent)
        return new_token, expires_seconds

    async def change_password(
        self,
        user: User,
        current_password: str,
        new_password: str,
        ip_address: str | None = None,
    ) -> bool:
        """Change password and revoke all sessions."""
        from app.core.security import hash_password

        if not verify_password(current_password, user.password_hash):
            return False

        user.password_hash = hash_password(new_password)
        await self.revoke_all_sessions(user.id)
        await self.log_audit(
            user_id=user.id,
            action=AuditAction.UPDATE,
            entity_type="user",
            entity_id=user.id,
            ip_address=ip_address,
            context={"event": "password_changed"},
        )
        return True
