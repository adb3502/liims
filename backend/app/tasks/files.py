"""Celery tasks for NAS file scanning and integrity verification."""

import asyncio
import logging

from sqlalchemy import select

from app.celery_app import celery
from app.database import async_session_factory
from app.models.file_store import ManagedFile
from app.services.file_store import FileStoreService, WatchDirectoryService

logger = logging.getLogger(__name__)


async def _scan_all_watch_directories() -> int:
    """Scan all active watch directories and register new files."""
    total_ingested = 0

    async with async_session_factory() as db:
        svc = WatchDirectoryService(db)
        watch_dirs = await svc.get_all_active_watch_dirs()

        for watch_dir in watch_dirs:
            try:
                ingested = await svc._scan_watch_dir(watch_dir)
                total_ingested += len(ingested)
                if ingested:
                    logger.info(
                        "Watch dir %s: ingested %d file(s).",
                        watch_dir.path, len(ingested),
                    )
            except Exception:
                logger.exception(
                    "Error scanning watch directory: %s", watch_dir.path
                )

        await db.commit()

    return total_ingested


async def _verify_nas_files() -> dict:
    """Verify integrity of all non-deleted files by recomputing checksums."""
    checked = 0
    mismatches = 0
    errors = 0

    async with async_session_factory() as db:
        result = await db.execute(
            select(ManagedFile.id).where(
                ManagedFile.is_deleted == False  # noqa: E712
            )
        )
        file_ids = [row[0] for row in result.all()]

        svc = FileStoreService(db)
        for file_id in file_ids:
            try:
                verification = await svc.verify_file_integrity(file_id)
                checked += 1

                if verification.get("error"):
                    errors += 1
                elif not verification.get("match"):
                    mismatches += 1
            except Exception:
                logger.exception("Error verifying file %s", file_id)
                errors += 1

        await db.commit()

    return {"checked": checked, "mismatches": mismatches, "errors": errors}


@celery.task(
    name="app.tasks.files.scan_watch_directories",
    bind=True,
    max_retries=2,
)
def scan_watch_directories(self) -> dict:
    """Celery beat task: scan all active watch directories for new files."""
    try:
        total = asyncio.get_event_loop().run_until_complete(
            _scan_all_watch_directories()
        )
        return {"status": "ok", "files_ingested": total}
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            total = loop.run_until_complete(_scan_all_watch_directories())
            return {"status": "ok", "files_ingested": total}
        finally:
            loop.close()
    except Exception as exc:
        logger.exception("Watch directory scan failed")
        self.retry(exc=exc, countdown=120)


@celery.task(
    name="app.tasks.files.verify_nas_files",
    bind=True,
    max_retries=1,
)
def verify_nas_files(self) -> dict:
    """Celery beat task: verify integrity of all managed files on NAS."""
    try:
        result = asyncio.get_event_loop().run_until_complete(
            _verify_nas_files()
        )
        return {"status": "ok", **result}
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(_verify_nas_files())
            return {"status": "ok", **result}
        finally:
            loop.close()
    except Exception as exc:
        logger.exception("NAS file verification failed")
        self.retry(exc=exc, countdown=600)
