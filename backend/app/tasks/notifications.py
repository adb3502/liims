"""Celery tasks for async email notification sending."""

from app.celery_app import celery
from app.core.email import render_notification_email, send_email


@celery.task(name="app.tasks.notifications.send_notification_email", bind=True, max_retries=3)
def send_notification_email(
    self,
    recipients: list[str],
    title: str,
    message: str,
    severity: str,
) -> bool:
    """Send a notification email asynchronously."""
    try:
        html = render_notification_email(title, message, severity)
        return send_email(recipients, f"LIIMS Alert: {title}", html, body_text=message)
    except Exception as exc:
        self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
