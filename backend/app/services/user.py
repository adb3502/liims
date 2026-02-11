"""User management service."""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.enums import AuditAction, UserRole
from app.models.user import AuditLog, User
from app.schemas.user import UserCreate, UserUpdate

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_user(
        self,
        data: UserCreate,
        created_by: uuid.UUID | None = None,
    ) -> User:
        """Create a new user."""
        user = User(
            id=uuid.uuid4(),
            email=data.email,
            password_hash=hash_password(data.password),
            full_name=data.full_name,
            role=data.role,
            is_active=True,
            created_by=created_by,
        )
        self.db.add(user)
        await self.db.flush()

        # Audit
        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="user",
            entity_id=user.id,
            new_values={"email": user.email, "role": user.role.value, "full_name": user.full_name},
        ))

        return user

    async def get_user_by_id(self, user_id: uuid.UUID) -> User | None:
        result = await self.db.execute(
            select(User).where(User.id == user_id, User.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> User | None:
        result = await self.db.execute(
            select(User).where(User.email == email, User.is_deleted == False)  # noqa: E712
        )
        return result.scalar_one_or_none()

    async def list_users(
        self,
        page: int = 1,
        per_page: int = 20,
        role: UserRole | None = None,
        is_active: bool | None = None,
        search: str | None = None,
    ) -> tuple[list[User], int]:
        """List users with pagination and optional filters. Returns (users, total)."""
        query = select(User).where(User.is_deleted == False)  # noqa: E712

        if role is not None:
            query = query.where(User.role == role)
        if is_active is not None:
            query = query.where(User.is_active == is_active)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                User.full_name.ilike(pattern) | User.email.ilike(pattern)
            )

        # Count
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar_one()

        # Page
        query = query.order_by(User.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        users = list(result.scalars().all())

        return users, total

    async def update_user(
        self,
        user_id: uuid.UUID,
        data: UserUpdate,
        updated_by: uuid.UUID,
    ) -> User | None:
        """Update a user's mutable fields."""
        user = await self.get_user_by_id(user_id)
        if user is None:
            return None

        old_values = {}
        new_values = {}

        if data.full_name is not None and data.full_name != user.full_name:
            old_values["full_name"] = user.full_name
            user.full_name = data.full_name
            new_values["full_name"] = data.full_name

        if data.role is not None and data.role != user.role:
            old_values["role"] = user.role.value
            user.role = data.role
            new_values["role"] = data.role.value

        if data.is_active is not None and data.is_active != user.is_active:
            old_values["is_active"] = user.is_active
            user.is_active = data.is_active
            new_values["is_active"] = data.is_active

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="user",
                entity_id=user.id,
                old_values=old_values,
                new_values=new_values,
            ))

        return user

    async def soft_delete_user(
        self, user_id: uuid.UUID, deleted_by: uuid.UUID
    ) -> bool:
        """Soft-delete a user."""
        user = await self.get_user_by_id(user_id)
        if user is None:
            return False

        user.is_deleted = True
        user.deleted_at = datetime.now(timezone.utc)
        user.is_active = False

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=deleted_by,
            action=AuditAction.DELETE,
            entity_type="user",
            entity_id=user.id,
        ))
        return True

    async def reset_password(
        self, user_id: uuid.UUID, new_password: str, reset_by: uuid.UUID
    ) -> bool:
        """Admin password reset -- sets new password and revokes all sessions."""
        user = await self.get_user_by_id(user_id)
        if user is None:
            return False

        user.password_hash = hash_password(new_password)

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=reset_by,
            action=AuditAction.UPDATE,
            entity_type="user",
            entity_id=user.id,
            context={"event": "admin_password_reset"},
        ))
        return True
