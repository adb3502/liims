"""SMTP email client wrapper."""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def send_email(
    to_addresses: list[str],
    subject: str,
    body_html: str,
    body_text: str | None = None,
) -> bool:
    """Send an email via SMTP. Returns True on success, False on failure."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.warning("SMTP not configured. Skipping email.")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
        msg["To"] = ", ".join(to_addresses)

        if body_text:
            msg.attach(MIMEText(body_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

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

    return f"""
    <html>
    <body style="font-family: Inter, Arial, sans-serif; margin: 0; padding: 20px; background: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="background: {color}; padding: 16px 24px;">
                <h2 style="color: white; margin: 0; font-size: 18px;">LIIMS Alert: {title}</h2>
            </div>
            <div style="padding: 24px;">
                <p style="color: #334155; line-height: 1.6; margin: 0 0 16px 0;">{message}</p>
                <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0 0;">
                    This is an automated notification from LIIMS. Do not reply to this email.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
