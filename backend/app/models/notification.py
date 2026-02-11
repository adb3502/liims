"""Notification model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDPrimaryKeyMixin, Base
from app.models.enums import NotificationSeverity, NotificationType, UserRole


class Notification(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "notification"

    recipient_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    recipient_role: Mapped[UserRole | None] = mapped_column(nullable=True)
    notification_type: Mapped[NotificationType] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[NotificationSeverity] = mapped_column(nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    is_read: Mapped[bool] = mapped_column(default=False, server_default="false")
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    email_sent: Mapped[bool] = mapped_column(default=False, server_default="false")
    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_notification_recipient", "recipient_id"),
        Index("ix_notification_role", "recipient_role"),
        Index("ix_notification_type", "notification_type"),
        Index("ix_notification_read", "is_read"),
        Index("ix_notification_created", "created_at"),
    )
