"""Seed initial data: super admin user and default system settings."""

import asyncio
import uuid
from datetime import datetime, timezone

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.enums import SettingValueType, UserRole
from app.models.system import SystemSetting
from app.models.user import User


DEFAULT_ADMIN_EMAIL = "admin@liims.local"
DEFAULT_ADMIN_PASSWORD = "ChangeMe123!"  # Must be changed on first login


async def seed_super_admin(session: AsyncSession) -> None:
    """Create default super admin if no users exist."""
    result = await session.execute(select(User).limit(1))
    if result.scalar_one_or_none() is not None:
        print("Users already exist, skipping admin seed.")
        return

    password_hash = bcrypt.hashpw(
        DEFAULT_ADMIN_PASSWORD.encode("utf-8"), bcrypt.gensalt(rounds=12)
    ).decode("utf-8")

    admin = User(
        id=uuid.uuid4(),
        email=DEFAULT_ADMIN_EMAIL,
        password_hash=password_hash,
        full_name="System Administrator",
        role=UserRole.SUPER_ADMIN,
        is_active=True,
    )
    session.add(admin)
    print(f"Created super admin: {DEFAULT_ADMIN_EMAIL}")


DEFAULT_SETTINGS = [
    ("session", "timeout_minutes", "30", SettingValueType.INTEGER, "Session inactivity timeout in minutes"),
    ("session", "max_concurrent", "3", SettingValueType.INTEGER, "Maximum concurrent sessions per user"),
    ("odk", "sync_interval_minutes", "60", SettingValueType.INTEGER, "ODK sync interval in minutes"),
    ("odk", "central_url", "", SettingValueType.STRING, "ODK Central server URL"),
    ("email", "smtp_host", "", SettingValueType.STRING, "SMTP server hostname"),
    ("email", "smtp_port", "587", SettingValueType.INTEGER, "SMTP server port"),
    ("email", "smtp_use_tls", "true", SettingValueType.BOOLEAN, "Use TLS for SMTP"),
    ("email", "from_name", "LIIMS Alerts", SettingValueType.STRING, "Email from name"),
    ("dashboard", "refresh_interval_minutes", "15", SettingValueType.INTEGER, "Dashboard cache refresh interval"),
    ("backup", "check_interval_hours", "24", SettingValueType.INTEGER, "Backup staleness check interval"),
    ("storage", "plasma_processing_timeout_min", "30", SettingValueType.INTEGER, "Plasma processing timeout in minutes"),
]


async def seed_settings(session: AsyncSession) -> None:
    """Insert default system settings if not present."""
    result = await session.execute(select(SystemSetting).limit(1))
    if result.scalar_one_or_none() is not None:
        print("Settings already exist, skipping settings seed.")
        return

    for category, key, value, value_type, description in DEFAULT_SETTINGS:
        setting = SystemSetting(
            id=uuid.uuid4(),
            category=category,
            key=key,
            value=value,
            value_type=value_type,
            description=description,
        )
        session.add(setting)

    print(f"Seeded {len(DEFAULT_SETTINGS)} default system settings.")


async def run_seed() -> None:
    async with async_session_factory() as session:
        await seed_super_admin(session)
        await seed_settings(session)
        await session.commit()
    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(run_seed())
