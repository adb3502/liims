"""Celery task for scheduled ODK Central sync."""

import asyncio
import logging

from app.celery_app import celery
from app.database import async_session_factory

logger = logging.getLogger(__name__)


@celery.task(name="app.tasks.odk.sync_odk_submissions", bind=True, max_retries=2)
def sync_odk_submissions(self):
    """Pull new submissions from ODK Central and create participants.

    Scheduled to run every Monday at 6:00 AM IST via celery beat.
    Can also be triggered manually via the API.
    """
    logger.info("Starting scheduled ODK sync...")

    try:
        asyncio.run(_run_sync())
        logger.info("ODK sync completed successfully.")
    except Exception as exc:
        logger.exception("ODK sync failed: %s", exc)
        raise self.retry(exc=exc, countdown=300)  # Retry after 5 min


async def _run_sync():
    """Run the actual sync using the OdkService."""
    from sqlalchemy import select
    from app.models.user import User
    from app.services.partner import OdkService

    async with async_session_factory() as session:
        # Use first admin user as the triggered_by
        result = await session.execute(
            select(User).where(User.role == "SUPER_ADMIN").limit(1)
        )
        admin = result.scalar_one_or_none()
        if admin is None:
            result = await session.execute(select(User).limit(1))
            admin = result.scalar_one_or_none()

        if admin is None:
            logger.error("No users found in database, cannot run ODK sync")
            return

        svc = OdkService(session)
        log = await svc.trigger_sync(form_id=None, triggered_by=admin.id)
        await session.commit()

        logger.info(
            "ODK sync result: status=%s, found=%s, processed=%s, failed=%s",
            log.status.value,
            log.submissions_found,
            log.submissions_processed,
            log.submissions_failed,
        )
        if log.error_message:
            logger.error("ODK sync error: %s", log.error_message)
