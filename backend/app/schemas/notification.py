"""Notification request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.enums import NotificationSeverity, NotificationType, UserRole


class NotificationRead(BaseModel):
    id: uuid.UUID
    recipient_id: uuid.UUID | None
    recipient_role: UserRole | None
    notification_type: NotificationType
    title: str
    message: str
    severity: NotificationSeverity
    entity_type: str | None
    entity_id: uuid.UUID | None
    is_read: bool
    read_at: datetime | None
    email_sent: bool
    created_at: datetime
    expires_at: datetime | None

    model_config = {"from_attributes": True}
