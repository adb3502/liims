"""System settings service: CRUD with Redis caching and audit logging."""

import json
import logging
import uuid
from datetime import datetime, timezone
from itertools import groupby

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AuditAction, SettingValueType
from app.models.system import SystemSetting
from app.models.user import AuditLog

logger = logging.getLogger(__name__)

CACHE_PREFIX = "setting:"
CACHE_TTL_SECONDS = 300  # 5 minutes


def _get_redis():
    """Lazy import of Redis client. Returns None if unavailable."""
    try:
        import redis
        from app.config import settings
        return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        logger.debug("Redis not available for settings cache")
        return None


def _validate_setting_value(value: str, value_type: SettingValueType) -> str | None:
    """Validate that the value matches the declared type. Returns error message or None."""
    if value_type == SettingValueType.INTEGER:
        try:
            int(value)
        except ValueError:
            return f"Value must be a valid integer, got '{value}'."
    elif value_type == SettingValueType.BOOLEAN:
        if value.lower() not in ("true", "false", "1", "0"):
            return f"Value must be true/false or 1/0, got '{value}'."
    elif value_type == SettingValueType.JSON:
        try:
            json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return f"Value must be valid JSON."
    return None


def _cast_value(value: str, value_type: SettingValueType):
    """Cast a string value to its typed form."""
    if value_type == SettingValueType.INTEGER:
        return int(value)
    elif value_type == SettingValueType.BOOLEAN:
        return value.lower() in ("true", "1")
    elif value_type == SettingValueType.JSON:
        return json.loads(value)
    return value


class SystemSettingService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_settings(self) -> list[SystemSetting]:
        """Get all settings ordered by category, key."""
        result = await self.db.execute(
            select(SystemSetting).order_by(SystemSetting.category, SystemSetting.key)
        )
        return list(result.scalars().all())

    async def get_all_grouped(self) -> list[dict]:
        """Get all settings grouped by category."""
        settings = await self.get_all_settings()
        grouped = []
        for category, items in groupby(settings, key=lambda s: s.category):
            grouped.append({
                "category": category,
                "settings": list(items),
            })
        return grouped

    async def get_setting_by_key(self, category: str, key: str) -> SystemSetting | None:
        """Get a single setting by category and key."""
        result = await self.db.execute(
            select(SystemSetting).where(
                SystemSetting.category == category,
                SystemSetting.key == key,
            )
        )
        return result.scalar_one_or_none()

    async def get_typed_value(self, category: str, key: str, default=None):
        """Get a setting value, cast to its declared type. Uses Redis cache if available."""
        cache_key = f"{CACHE_PREFIX}{category}:{key}"
        r = _get_redis()
        if r:
            try:
                cached = r.get(cache_key)
                if cached is not None:
                    meta = json.loads(cached)
                    return _cast_value(meta["value"], SettingValueType(meta["type"]))
            except Exception:
                logger.debug("Cache miss or error for %s", cache_key)

        setting = await self.get_setting_by_key(category, key)
        if setting is None:
            return default

        # Cache it
        if r:
            try:
                r.setex(
                    cache_key,
                    CACHE_TTL_SECONDS,
                    json.dumps({"value": setting.value, "type": setting.value_type.value}),
                )
            except Exception:
                logger.debug("Failed to cache setting %s", cache_key)

        return _cast_value(setting.value, setting.value_type)

    async def update_setting(
        self,
        category: str,
        key: str,
        new_value: str,
        updated_by: uuid.UUID,
    ) -> SystemSetting | None:
        """Update a setting value with validation and audit logging."""
        setting = await self.get_setting_by_key(category, key)
        if setting is None:
            return None

        # Validate value against declared type
        error = _validate_setting_value(new_value, setting.value_type)
        if error:
            raise ValueError(error)

        old_value = setting.value
        setting.value = new_value
        setting.updated_by = updated_by
        setting.updated_at = datetime.now(timezone.utc)
        await self.db.flush()

        # Audit log
        audit = AuditLog(
            id=uuid.uuid4(),
            user_id=updated_by,
            action=AuditAction.UPDATE,
            entity_type="system_setting",
            entity_id=setting.id,
            old_values={"value": old_value},
            new_values={"value": new_value},
        )
        self.db.add(audit)

        # Invalidate cache
        cache_key = f"{CACHE_PREFIX}{category}:{key}"
        r = _get_redis()
        if r:
            try:
                r.delete(cache_key)
            except Exception:
                logger.debug("Failed to invalidate cache for %s", cache_key)

        return setting

    async def get_settings_by_category(self, category: str) -> list[SystemSetting]:
        """Get all settings in a specific category."""
        result = await self.db.execute(
            select(SystemSetting)
            .where(SystemSetting.category == category)
            .order_by(SystemSetting.key)
        )
        return list(result.scalars().all())
