"""SMTP email client wrapper."""

import html
import logging
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def send_email(
    to_addresses: list[str],
    subject: str,
    body_html: str,
    body_text: str | None = None,
    attachments: list[tuple[str, bytes]] | None = None,
) -> bool:
    """Send an email via SMTP. Returns True on success, False on failure.

    Args:
        attachments: Optional list of (filename, data_bytes) tuples to attach.
    """
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.warning("SMTP not configured. Skipping email.")
        return False

    try:
        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
        msg["To"] = ", ".join(to_addresses)

        # Body part (alternative for text/html)
        body_part = MIMEMultipart("alternative")
        if body_text:
            body_part.attach(MIMEText(body_text, "plain"))
        body_part.attach(MIMEText(body_html, "html"))
        msg.attach(body_part)

        # Attachments
        if attachments:
            for filename, data in attachments:
                part = MIMEApplication(data, Name=filename)
                part["Content-Disposition"] = f'attachment; filename="{filename}"'
                msg.attach(part)

        if settings.SMTP_USE_TLS:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
            server.starttls()
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)

        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USER, to_addresses, msg.as_string())
        server.quit()
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to_addresses)
        return False


def render_notification_email(title: str, message: str, severity: str) -> str:
    """Render a simple HTML email for a notification."""
    severity_colors = {
        "info": "#2563eb",
        "warning": "#d97706",
        "critical": "#dc2626",
    }
    color = severity_colors.get(severity, "#2563eb")

    safe_title = html.escape(title)
    safe_message = html.escape(message)

    return f"""
    <html>
    <body style="font-family: Inter, Arial, sans-serif; margin: 0; padding: 20px; background: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: {color}; padding: 16px 24px;">
                <h2 style="color: white; margin: 0; font-size: 18px;">LIIMS Alert: {safe_title}</h2>
            </div>
            <div style="padding: 24px;">
                <p style="color: #334155; line-height: 1.6; margin: 0 0 16px 0;">{safe_message}</p>
                <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0 0;">
                    This is an automated notification from LIIMS. Do not reply to this email.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
