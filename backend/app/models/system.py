"""System settings, scheduled reports, and dashboard cache models."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDPrimaryKeyMixin, Base
from app.models.enums import DashboardType, ReportType, SettingValueType


class SystemSetting(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "system_setting"

    category: Mapped[str] = mapped_column(String(100), nullable=False)
    key: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    value_type: Mapped[SettingValueType] = mapped_column(nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("category", "key", name="uq_setting_category_key"),
        Index("ix_setting_category", "category"),
    )


class ScheduledReport(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "scheduled_report"

    report_name: Mapped[str] = mapped_column(String(200), nullable=False)
    report_type: Mapped[ReportType] = mapped_column(nullable=False)
    schedule_cron: Mapped[str] = mapped_column(String(50), nullable=False)
    recipients: Mapped[dict] = mapped_column(JSONB, nullable=False)
    filters: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    last_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )


class DashboardCache(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "dashboard_cache"

    dashboard_type: Mapped[DashboardType] = mapped_column(nullable=False)
    cache_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    computation_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_refresh_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_dashboard_cache_type", "dashboard_type"),
    )
