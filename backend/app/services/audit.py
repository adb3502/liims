"""Enhanced audit logging service.

Provides a consistent interface for recording all mutations with
old/new value diffs, user context, and IP address tracking.
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AuditAction
from app.models.user import AuditLog

logger = logging.getLogger(__name__)


class AuditService:
    """Service for creating structured audit log entries."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def log(
        self,
        *,
        user_id: uuid.UUID | None,
        action: AuditAction,
        entity_type: str,
        entity_id: uuid.UUID | None = None,
        old_values: dict | None = None,
        new_values: dict | None = None,
        ip_address: str | None = None,
        context: dict | None = None,
    ) -> AuditLog:
        """Create an audit log entry.

        Args:
            user_id: The user who performed the action (None for system actions).
            action: The type of action (CREATE, UPDATE, DELETE, VIEW, EXPORT).
            entity_type: The type of entity affected (e.g. "participant", "sample").
            entity_id: The UUID of the affected entity.
            old_values: Previous values before mutation (for UPDATE/DELETE).
            new_values: New values after mutation (for CREATE/UPDATE).
            ip_address: Client IP address.
            context: Additional context metadata.
        """
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

        logger.info(
            "AUDIT: user=%s action=%s entity=%s/%s",
            user_id,
            action.value,
            entity_type,
            entity_id,
        )
        return entry

    async def log_create(
        self,
        *,
        user_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        new_values: dict | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Shorthand for logging a CREATE action."""
        return await self.log(
            user_id=user_id,
            action=AuditAction.CREATE,
            entity_type=entity_type,
            entity_id=entity_id,
            new_values=new_values,
            ip_address=ip_address,
        )

    async def log_update(
        self,
        *,
        user_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        old_values: dict | None = None,
        new_values: dict | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Shorthand for logging an UPDATE action."""
        return await self.log(
            user_id=user_id,
            action=AuditAction.UPDATE,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            new_values=new_values,
            ip_address=ip_address,
        )

    async def log_delete(
        self,
        *,
        user_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        old_values: dict | None = None,
        ip_address: str | None = None,
    ) -> AuditLog:
        """Shorthand for logging a DELETE action."""
        return await self.log(
            user_id=user_id,
            action=AuditAction.DELETE,
            entity_type=entity_type,
            entity_id=entity_id,
            old_values=old_values,
            ip_address=ip_address,
        )

    async def log_export(
        self,
        *,
        user_id: uuid.UUID,
        entity_type: str,
        ip_address: str | None = None,
        context: dict | None = None,
    ) -> AuditLog:
        """Shorthand for logging an EXPORT action."""
        return await self.log(
            user_id=user_id,
            action=AuditAction.EXPORT,
            entity_type=entity_type,
            ip_address=ip_address,
            context=context,
        )

    @staticmethod
    def diff_values(old: dict, new: dict) -> tuple[dict, dict]:
        """Compute old/new value dicts containing only changed fields.

        Returns:
            (old_changed, new_changed) - dicts with only the keys that differ.
        """
        old_changed = {}
        new_changed = {}
        all_keys = set(old.keys()) | set(new.keys())
        for key in all_keys:
            old_val = old.get(key)
            new_val = new.get(key)
            if old_val != new_val:
                old_changed[key] = old_val
                new_changed[key] = new_val
        return old_changed, new_changed
