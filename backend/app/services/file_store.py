"""File store and watch directory services.

Files live on the NAS and are discovered by periodic scans of watch directories.
Only metadata is stored in the database; file content is never served via API.
"""

import hashlib
import logging
import mimetypes
import uuid
from datetime import datetime, timezone
from fnmatch import fnmatch
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import AuditAction, FileCategory, NotificationSeverity, NotificationType, UserRole
from app.models.file_store import ManagedFile, WatchDirectory
from app.models.notification import Notification
from app.models.user import AuditLog
from app.schemas.file_store import WatchDirectoryCreate, WatchDirectoryUpdate

logger = logging.getLogger(__name__)


def _escape_ilike(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _compute_sha256_file(path: Path) -> str:
    """Compute SHA-256 hash by reading file in chunks (memory-safe)."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


FILE_ALLOWED_SORTS = {"file_name", "file_size", "category", "discovered_at", "created_at", "updated_at"}


class FileStoreService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_files(
        self,
        page: int = 1,
        per_page: int = 20,
        search: str | None = None,
        category: FileCategory | None = None,
        instrument_id: uuid.UUID | None = None,
        associated_entity_type: str | None = None,
        associated_entity_id: uuid.UUID | None = None,
        sort: str = "discovered_at",
        order: str = "desc",
    ) -> tuple[list[ManagedFile], int]:
        query = select(ManagedFile).where(ManagedFile.is_deleted == False)  # noqa: E712

        if search:
            safe = _escape_ilike(search)
            query = query.where(ManagedFile.file_name.ilike(f"%{safe}%"))
        if category:
            query = query.where(ManagedFile.category == category)
        if instrument_id:
            query = query.where(ManagedFile.instrument_id == instrument_id)
        if associated_entity_type:
            query = query.where(ManagedFile.entity_type == associated_entity_type)
        if associated_entity_id:
            query = query.where(ManagedFile.entity_id == associated_entity_id)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        sort_col = sort if sort in FILE_ALLOWED_SORTS else "discovered_at"
        col = getattr(ManagedFile, sort_col)
        query = query.order_by(col.desc() if order == "desc" else col.asc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_file(self, file_id: uuid.UUID) -> ManagedFile | None:
        result = await self.db.execute(
            select(ManagedFile).where(
                ManagedFile.id == file_id,
                ManagedFile.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_files_for_entity(
        self, entity_type: str, entity_id: uuid.UUID
    ) -> list[ManagedFile]:
        """Return all files associated with a given entity."""
        result = await self.db.execute(
            select(ManagedFile).where(
                ManagedFile.entity_type == entity_type,
                ManagedFile.entity_id == entity_id,
                ManagedFile.is_deleted == False,  # noqa: E712
            ).order_by(ManagedFile.discovered_at.desc())
        )
        return list(result.scalars().all())

    async def associate_file(
        self,
        file_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        updated_by: uuid.UUID,
    ) -> ManagedFile | None:
        managed_file = await self.get_file(file_id)
        if managed_file is None:
            return None

        old_entity_type = managed_file.entity_type
        old_entity_id = str(managed_file.entity_id) if managed_file.entity_id else None

        managed_file.entity_type = entity_type
        managed_file.entity_id = entity_id

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=updated_by,
            action=AuditAction.UPDATE,
            entity_type="managed_file",
            entity_id=managed_file.id,
            old_values={
                "entity_type": old_entity_type,
                "entity_id": old_entity_id,
            },
            new_values={
                "entity_type": entity_type,
                "entity_id": str(entity_id),
            },
        ))
        return managed_file

    async def delete_file(
        self, file_id: uuid.UUID, deleted_by: uuid.UUID
    ) -> ManagedFile | None:
        managed_file = await self.get_file(file_id)
        if managed_file is None:
            return None

        managed_file.is_deleted = True
        managed_file.deleted_at = datetime.now(timezone.utc)

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=deleted_by,
            action=AuditAction.DELETE,
            entity_type="managed_file",
            entity_id=managed_file.id,
            old_values={"file_name": managed_file.file_name},
        ))
        return managed_file

    async def verify_file_integrity(self, file_id: uuid.UUID) -> dict:
        """Recompute SHA-256 checksum from disk and compare with stored value.

        Returns a dict with keys: file_id, file_path, stored_checksum,
        current_checksum, match (bool), error (str | None).
        """
        managed_file = await self.get_file(file_id)
        if managed_file is None:
            return {"file_id": str(file_id), "error": "File not found in database."}

        result = {
            "file_id": str(managed_file.id),
            "file_path": managed_file.file_path,
            "stored_checksum": managed_file.checksum_sha256,
            "current_checksum": None,
            "match": False,
            "error": None,
        }

        file_path = Path(managed_file.file_path)
        if not file_path.is_file():
            result["error"] = "File not found on disk."
            return result

        try:
            current = _compute_sha256_file(file_path)
        except OSError as e:
            result["error"] = f"Could not read file: {e}"
            return result

        result["current_checksum"] = current
        result["match"] = current == managed_file.checksum_sha256

        if not result["match"]:
            # Create notification for integrity failure
            self.db.add(Notification(
                id=uuid.uuid4(),
                recipient_role=UserRole.SUPER_ADMIN,
                notification_type=NotificationType.FILE_INTEGRITY_FAILED,
                title="File integrity check failed",
                message=(
                    f"Checksum mismatch for {managed_file.file_name} "
                    f"at {managed_file.file_path}"
                ),
                severity=NotificationSeverity.CRITICAL,
                entity_type="managed_file",
                entity_id=managed_file.id,
            ))

        return result


class WatchDirectoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_watch_dir(
        self, data: WatchDirectoryCreate
    ) -> WatchDirectory:
        watch_dir = WatchDirectory(
            id=uuid.uuid4(),
            path=data.path,
            instrument_id=data.instrument_id,
            file_pattern=data.file_pattern,
            category=data.category,
        )
        self.db.add(watch_dir)
        await self.db.flush()
        return watch_dir

    async def update_watch_dir(
        self, watch_dir_id: uuid.UUID, data: WatchDirectoryUpdate
    ) -> WatchDirectory | None:
        result = await self.db.execute(
            select(WatchDirectory).where(WatchDirectory.id == watch_dir_id)
        )
        watch_dir = result.scalar_one_or_none()
        if watch_dir is None:
            return None

        if data.instrument_id is not None:
            watch_dir.instrument_id = data.instrument_id
        if data.file_pattern is not None:
            watch_dir.file_pattern = data.file_pattern
        if data.category is not None:
            watch_dir.category = data.category
        if data.is_active is not None:
            watch_dir.is_active = data.is_active

        return watch_dir

    async def list_watch_dirs(
        self,
        page: int = 1,
        per_page: int = 20,
        include_inactive: bool = False,
    ) -> tuple[list[WatchDirectory], int]:
        query = select(WatchDirectory)
        if not include_inactive:
            query = query.where(WatchDirectory.is_active == True)  # noqa: E712

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(WatchDirectory.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_all_active_watch_dirs(self) -> list[WatchDirectory]:
        """Return all active watch directories (no pagination, for Celery scan)."""
        result = await self.db.execute(
            select(WatchDirectory).where(WatchDirectory.is_active == True)  # noqa: E712
        )
        return list(result.scalars().all())

    async def scan_directory(
        self, watch_dir_id: uuid.UUID
    ) -> list[ManagedFile]:
        """Scan a watch directory for new files and register their metadata."""
        result = await self.db.execute(
            select(WatchDirectory).where(
                WatchDirectory.id == watch_dir_id,
                WatchDirectory.is_active == True,  # noqa: E712
            )
        )
        watch_dir = result.scalar_one_or_none()
        if watch_dir is None:
            raise ValueError("Watch directory not found or inactive.")

        return await self._scan_watch_dir(watch_dir)

    async def _scan_watch_dir(
        self, watch_dir: WatchDirectory
    ) -> list[ManagedFile]:
        """Internal scan logic, shared between manual trigger and Celery task."""
        dir_path = Path(watch_dir.path)
        if not dir_path.is_dir():
            logger.warning("Watch directory does not exist: %s", watch_dir.path)
            return []

        # Get already-known file paths to skip duplicates
        existing_paths_result = await self.db.execute(
            select(ManagedFile.file_path).where(
                ManagedFile.is_deleted == False  # noqa: E712
            )
        )
        existing_paths = {row[0] for row in existing_paths_result.all()}

        ingested: list[ManagedFile] = []

        for entry in sorted(dir_path.iterdir()):
            if not entry.is_file():
                continue
            if not fnmatch(entry.name, watch_dir.file_pattern):
                continue

            full_path = str(entry.resolve())

            # Skip if already registered
            if full_path in existing_paths:
                continue

            try:
                stat = entry.stat()
                checksum = _compute_sha256_file(entry)
            except OSError as e:
                logger.warning("Could not read file %s: %s", entry, e)
                continue

            content_type, _ = mimetypes.guess_type(entry.name)
            content_type = content_type or "application/octet-stream"

            managed_file = ManagedFile(
                id=uuid.uuid4(),
                file_path=full_path,
                file_name=entry.name,
                file_size=stat.st_size,
                mime_type=content_type,
                checksum_sha256=checksum,
                category=watch_dir.category,
                instrument_id=watch_dir.instrument_id,
            )
            self.db.add(managed_file)
            ingested.append(managed_file)
            existing_paths.add(full_path)

        # Update last_scanned_at
        watch_dir.last_scanned_at = datetime.now(timezone.utc)

        if ingested:
            await self.db.flush()

            # Create notification for new discoveries
            self.db.add(Notification(
                id=uuid.uuid4(),
                recipient_role=UserRole.LAB_MANAGER,
                notification_type=NotificationType.FILE_DISCOVERED,
                title=f"{len(ingested)} new file(s) discovered",
                message=(
                    f"Scan of {watch_dir.path} discovered {len(ingested)} new file(s): "
                    + ", ".join(f.file_name for f in ingested[:5])
                    + ("..." if len(ingested) > 5 else "")
                ),
                severity=NotificationSeverity.INFO,
                entity_type="watch_directory",
                entity_id=watch_dir.id,
            ))

            # Audit log
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=None,
                action=AuditAction.CREATE,
                entity_type="managed_file",
                entity_id=watch_dir.id,
                new_values={
                    "watch_directory": watch_dir.path,
                    "files_ingested": len(ingested),
                    "file_names": [f.file_name for f in ingested[:20]],
                },
            ))

        return ingested
