"""Celery tasks for scheduled report generation and email delivery."""

import asyncio
import logging
from datetime import datetime, timezone

from croniter import croniter
from sqlalchemy import select

from app.celery_app import celery
from app.core.email import send_email
from app.database import async_session_factory
from app.models.enums import ReportType
from app.models.system import ScheduledReport
from app.services.report import ReportService

logger = logging.getLogger(__name__)

_REPORT_TYPE_LABELS = {
    ReportType.ENROLLMENT_SUMMARY: "Enrollment Summary",
    ReportType.INVENTORY_SUMMARY: "Inventory Summary",
    ReportType.QUALITY_SUMMARY: "Quality Summary",
    ReportType.COMPLIANCE: "Compliance",
}


async def _process_scheduled_reports() -> int:
    """Check all active scheduled reports and generate/send any that are due."""
    now = datetime.now(timezone.utc)
    sent_count = 0

    async with async_session_factory() as db:
        result = await db.execute(
            select(ScheduledReport).where(
                ScheduledReport.is_active == True  # noqa: E712
            )
        )
        reports = list(result.scalars().all())

        for report in reports:
            try:
                if not _is_due(report, now):
                    continue

                logger.info(
                    "Generating scheduled report: %s (type=%s)",
                    report.report_name, report.report_type.value,
                )

                svc = ReportService(db)
                pdf_bytes = await _generate_report(svc, report.report_type, report.filters)

                # Build the recipient list from JSONB (stored as list)
                recipients = report.recipients
                if isinstance(recipients, dict):
                    # Handle legacy format {"emails": [...]}
                    recipients = recipients.get("emails", [])
                if not isinstance(recipients, list) or not recipients:
                    logger.warning(
                        "Scheduled report %s has no valid recipients, skipping.",
                        report.id,
                    )
                    continue

                label = _REPORT_TYPE_LABELS.get(report.report_type, report.report_type.value)
                filename = f"{report.report_type.value}_{now.strftime('%Y%m%d')}.pdf"

                email_html = _render_report_email(report.report_name, label, now)
                success = send_email(
                    to_addresses=recipients,
                    subject=f"LIIMS Report: {report.report_name}",
                    body_html=email_html,
                    body_text=f"Please find attached the scheduled LIIMS report: {report.report_name}.",
                    attachments=[(filename, pdf_bytes)],
                )

                report.last_generated_at = now
                if success:
                    report.last_sent_at = now
                    sent_count += 1
                    logger.info("Sent report '%s' to %d recipient(s).", report.report_name, len(recipients))
                else:
                    logger.warning("Failed to send report '%s'.", report.report_name)

            except Exception:
                logger.exception("Error processing scheduled report %s", report.id)

        await db.commit()

    return sent_count


def _is_due(report: ScheduledReport, now: datetime) -> bool:
    """Check if a scheduled report is due based on its cron expression."""
    try:
        cron = croniter(report.schedule_cron, now)
        prev_fire = cron.get_prev(datetime)

        # If never generated, it's due
        if report.last_generated_at is None:
            return True

        # If the previous fire time is after the last generation, it's due
        last_gen = report.last_generated_at
        if last_gen.tzinfo is None:
            last_gen = last_gen.replace(tzinfo=timezone.utc)
        if prev_fire.tzinfo is None:
            prev_fire = prev_fire.replace(tzinfo=timezone.utc)

        return prev_fire > last_gen
    except (ValueError, KeyError):
        logger.warning(
            "Invalid cron expression for report %s: '%s'",
            report.id, report.schedule_cron,
        )
        return False


async def _generate_report(
    svc: ReportService,
    report_type: ReportType,
    filters: dict | None,
) -> bytes:
    """Generate the PDF for a given report type."""
    if report_type == ReportType.ENROLLMENT_SUMMARY:
        return await svc.generate_enrollment_report(filters=filters)
    elif report_type == ReportType.INVENTORY_SUMMARY:
        return await svc.generate_inventory_report(filters=filters)
    elif report_type == ReportType.QUALITY_SUMMARY:
        return await svc.generate_quality_report(filters=filters)
    elif report_type == ReportType.COMPLIANCE:
        return await svc.generate_compliance_report(filters=filters)
    else:
        raise ValueError(f"Unknown report type: {report_type}")


def _render_report_email(report_name: str, report_label: str, generated_at: datetime) -> str:
    """Render a simple HTML email body for the report delivery."""
    ts = generated_at.strftime("%Y-%m-%d %H:%M UTC")
    return f"""
    <html>
    <body style="font-family: Inter, Arial, sans-serif; margin: 0; padding: 20px; background: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: #1e40af; padding: 16px 24px;">
          <h2 style="color: white; margin: 0; font-size: 18px;">LIIMS Scheduled Report</h2>
        </div>
        <div style="padding: 24px;">
          <p style="color: #334155; line-height: 1.6; margin: 0 0 12px 0;">
            <strong>{report_name}</strong> ({report_label})
          </p>
          <p style="color: #334155; line-height: 1.6; margin: 0 0 12px 0;">
            Your scheduled report has been generated and is attached as a PDF.
          </p>
          <p style="color: #64748b; font-size: 13px; margin: 0 0 12px 0;">
            Generated at: {ts}
          </p>
          <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0 0;">
            This is an automated report from LIIMS - BHARAT Study, IISc Bangalore.
          </p>
        </div>
      </div>
    </body>
    </html>
    """


@celery.task(name="app.tasks.reports.process_scheduled_reports", bind=True, max_retries=2)
def process_scheduled_reports(self) -> dict:
    """Celery beat task: check and send all due scheduled reports."""
    try:
        sent = asyncio.get_event_loop().run_until_complete(_process_scheduled_reports())
        return {"status": "ok", "reports_sent": sent}
    except RuntimeError:
        # No event loop running; create a new one
        loop = asyncio.new_event_loop()
        try:
            sent = loop.run_until_complete(_process_scheduled_reports())
            return {"status": "ok", "reports_sent": sent}
        finally:
            loop.close()
    except Exception as exc:
        logger.exception("Scheduled report processing failed")
        self.retry(exc=exc, countdown=300)
