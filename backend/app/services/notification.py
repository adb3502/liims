"""Notification service: create, read, mark-read, email dispatch."""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationSeverity, NotificationType, UserRole
from app.models.notification import Notification
from app.models.user import User

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_notification(
        self,
        notification_type: NotificationType,
        severity: NotificationSeverity,
        title: str,
        message: str,
        recipient_id: uuid.UUID | None = None,
        recipient_role: UserRole | None = None,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        send_email: bool = False,
    ) -> Notification:
        """Create a single in-app notification."""
        notification = Notification(
            id=uuid.uuid4(),
            recipient_id=recipient_id,
            recipient_role=recipient_role,
            notification_type=notification_type,
            title=title,
            message=message,
            severity=severity,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        self.db.add(notification)
        await self.db.flush()

        if send_email and severity == NotificationSeverity.CRITICAL:
            # Dispatch email asynchronously via Celery
            try:
                from app.tasks.notifications import send_notification_email
                email_recipients = []
                if recipient_id:
                    result = await self.db.execute(
                        select(User.email).where(User.id == recipient_id)
                    )
                    email = result.scalar_one_or_none()
                    if email:
                        email_recipients.append(email)
                elif recipient_role:
                    result = await self.db.execute(
                        select(User.email).where(
                            User.role == recipient_role,
                            User.is_active == True,  # noqa: E712
                            User.is_deleted == False,  # noqa: E712
                        )
                    )
                    email_recipients = [row[0] for row in result.all()]

                if email_recipients:
                    send_notification_email.delay(
                        email_recipients, title, message, severity.value,
                    )
                    notification.email_sent = True
                    notification.email_sent_at = datetime.now(timezone.utc)
            except Exception:
                logger.exception("Failed to queue email notification")

        return notification

    async def notify_role(
        self,
        role: UserRole,
        notification_type: NotificationType,
        severity: NotificationSeverity,
        title: str,
        message: str,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        send_email: bool = False,
    ) -> list[Notification]:
        """Create notifications for all active users with a given role."""
        result = await self.db.execute(
            select(User.id).where(
                User.role == role,
                User.is_active == True,  # noqa: E712
                User.is_deleted == False,  # noqa: E712
            )
        )
        user_ids = [row[0] for row in result.all()]

        notifications = []
        for uid in user_ids:
            n = await self.create_notification(
                notification_type=notification_type,
                severity=severity,
                title=title,
                message=message,
                recipient_id=uid,
                entity_type=entity_type,
                entity_id=entity_id,
                send_email=send_email,
            )
            notifications.append(n)
        return notifications

    async def list_notifications(
        self,
        user_id: uuid.UUID,
        user_role: UserRole,
        page: int = 1,
        per_page: int = 20,
        notification_type: NotificationType | None = None,
        severity: NotificationSeverity | None = None,
        is_read: bool | None = None,
    ) -> tuple[list[Notification], int]:
        """List notifications for the current user (by ID or role)."""
        query = select(Notification).where(
            (Notification.recipient_id == user_id) | (Notification.recipient_role == user_role)
        )

        if notification_type:
            query = query.where(Notification.notification_type == notification_type)
        if severity:
            query = query.where(Notification.severity == severity)
        if is_read is not None:
            query = query.where(Notification.is_read == is_read)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(Notification.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_unread_count(self, user_id: uuid.UUID, user_role: UserRole) -> int:
        result = await self.db.execute(
            select(func.count(Notification.id)).where(
                (Notification.recipient_id == user_id) | (Notification.recipient_role == user_role),
                Notification.is_read == False,  # noqa: E712
            )
        )
        return result.scalar_one()

    async def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self.db.execute(
            select(Notification).where(Notification.id == notification_id)
        )
        notification = result.scalar_one_or_none()
        if notification is None:
            return False
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        return True

    async def mark_all_read(self, user_id: uuid.UUID, user_role: UserRole) -> int:
        """Mark all unread notifications as read. Returns count."""
        result = await self.db.execute(
            select(Notification).where(
                (Notification.recipient_id == user_id) | (Notification.recipient_role == user_role),
                Notification.is_read == False,  # noqa: E712
            )
        )
        notifications = result.scalars().all()
        now = datetime.now(timezone.utc)
        for n in notifications:
            n.is_read = True
            n.read_at = now
        return len(notifications)
