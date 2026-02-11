"""File store and watch directory services."""

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from fnmatch import fnmatch
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.enums import AuditAction, FileCategory
from app.models.file_store import ManagedFile, WatchDirectory
from app.models.user import AuditLog
from app.schemas.file_store import ManagedFileCreate, WatchDirectoryCreate

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = settings.FILE_STORE_MAX_SIZE_MB * 1024 * 1024  # bytes


def _escape_ilike(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _sanitize_filename(filename: str) -> str:
    """Sanitize a filename to prevent path traversal attacks."""
    # Strip directory separators and null bytes
    name = os.path.basename(filename)
    name = name.replace("\x00", "")
    # Remove leading dots to prevent hidden files
    name = name.lstrip(".")
    if not name:
        name = "unnamed"
    return name


def _compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


FILE_ALLOWED_SORTS = {"filename", "file_size", "category", "created_at", "updated_at"}


class FileStoreService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def upload_file(
        self,
        file_data: bytes,
        original_filename: str,
        content_type: str,
        data: ManagedFileCreate,
        uploaded_by: uuid.UUID,
    ) -> ManagedFile:
        if len(file_data) > MAX_FILE_SIZE:
            raise ValueError(
                f"File exceeds maximum size of {settings.FILE_STORE_MAX_SIZE_MB} MB."
            )

        safe_name = _sanitize_filename(original_filename)
        checksum = _compute_sha256(file_data)

        # Generate unique storage filename
        file_id = uuid.uuid4()
        ext = Path(safe_name).suffix
        stored_name = f"{file_id}{ext}"

        # Category sub-directory
        category_dir = Path(settings.FILE_STORE_PATH) / data.category.value
        category_dir.mkdir(parents=True, exist_ok=True)

        storage_path = category_dir / stored_name

        # Write to disk
        storage_path.write_bytes(file_data)

        managed_file = ManagedFile(
            id=file_id,
            filename=stored_name,
            original_filename=safe_name,
            content_type=content_type,
            file_size=len(file_data),
            storage_path=str(storage_path),
            category=data.category,
            uploaded_by=uploaded_by,
            associated_entity_type=data.associated_entity_type,
            associated_entity_id=data.associated_entity_id,
            checksum_sha256=checksum,
        )
        self.db.add(managed_file)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=uploaded_by,
            action=AuditAction.CREATE,
            entity_type="managed_file",
            entity_id=managed_file.id,
            new_values={
                "original_filename": safe_name,
                "category": data.category.value,
                "file_size": len(file_data),
            },
        ))
        return managed_file

    async def list_files(
        self,
        page: int = 1,
        per_page: int = 20,
        search: str | None = None,
        category: FileCategory | None = None,
        associated_entity_type: str | None = None,
        associated_entity_id: uuid.UUID | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> tuple[list[ManagedFile], int]:
        query = select(ManagedFile).where(ManagedFile.is_deleted == False)  # noqa: E712

        if search:
            safe = _escape_ilike(search)
            query = query.where(ManagedFile.original_filename.ilike(f"%{safe}%"))
        if category:
            query = query.where(ManagedFile.category == category)
        if associated_entity_type:
            query = query.where(ManagedFile.associated_entity_type == associated_entity_type)
        if associated_entity_id:
            query = query.where(ManagedFile.associated_entity_id == associated_entity_id)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        sort_col = sort if sort in FILE_ALLOWED_SORTS else "created_at"
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
            old_values={"original_filename": managed_file.original_filename},
        ))
        return managed_file

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

        old_entity_type = managed_file.associated_entity_type
        old_entity_id = str(managed_file.associated_entity_id) if managed_file.associated_entity_id else None

        managed_file.associated_entity_type = entity_type
        managed_file.associated_entity_id = entity_id

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=updated_by,
            action=AuditAction.UPDATE,
            entity_type="managed_file",
            entity_id=managed_file.id,
            old_values={
                "associated_entity_type": old_entity_type,
                "associated_entity_id": old_entity_id,
            },
            new_values={
                "associated_entity_type": entity_type,
                "associated_entity_id": str(entity_id),
            },
        ))
        return managed_file


WATCH_ALLOWED_SORTS = {"directory_path", "category", "created_at", "last_scan_at"}


class WatchDirectoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_watch_dir(
        self, data: WatchDirectoryCreate
    ) -> WatchDirectory:
        watch_dir = WatchDirectory(
            id=uuid.uuid4(),
            directory_path=data.directory_path,
            category=data.category,
            file_pattern=data.file_pattern,
            auto_process=data.auto_process,
        )
        self.db.add(watch_dir)
        await self.db.flush()
        return watch_dir

    async def list_watch_dirs(
        self,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[WatchDirectory], int]:
        query = select(WatchDirectory).where(WatchDirectory.is_active == True)  # noqa: E712

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(WatchDirectory.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def scan_directory(
        self,
        watch_dir_id: uuid.UUID,
        scanned_by: uuid.UUID,
    ) -> list[ManagedFile]:
        """Scan a watch directory for new files and ingest them."""
        result = await self.db.execute(
            select(WatchDirectory).where(
                WatchDirectory.id == watch_dir_id,
                WatchDirectory.is_active == True,  # noqa: E712
            )
        )
        watch_dir = result.scalar_one_or_none()
        if watch_dir is None:
            raise ValueError("Watch directory not found or inactive.")

        dir_path = Path(watch_dir.directory_path)
        if not dir_path.is_dir():
            raise ValueError(f"Directory does not exist: {watch_dir.directory_path}")

        # Get already-known checksums to skip duplicates
        existing_checksums_result = await self.db.execute(
            select(ManagedFile.checksum_sha256).where(
                ManagedFile.is_deleted == False  # noqa: E712
            )
        )
        existing_checksums = {row[0] for row in existing_checksums_result.all()}

        file_svc = FileStoreService(self.db)
        ingested: list[ManagedFile] = []

        for entry in sorted(dir_path.iterdir()):
            if not entry.is_file():
                continue
            if not fnmatch(entry.name, watch_dir.file_pattern):
                continue

            file_data = entry.read_bytes()
            if len(file_data) > MAX_FILE_SIZE:
                logger.warning("Skipping oversized file: %s (%d bytes)", entry.name, len(file_data))
                continue

            checksum = _compute_sha256(file_data)
            if checksum in existing_checksums:
                continue

            # Guess content type
            import mimetypes
            content_type, _ = mimetypes.guess_type(entry.name)
            content_type = content_type or "application/octet-stream"

            create_data = ManagedFileCreate(category=watch_dir.category)
            managed_file = await file_svc.upload_file(
                file_data=file_data,
                original_filename=entry.name,
                content_type=content_type,
                data=create_data,
                uploaded_by=scanned_by,
            )
            ingested.append(managed_file)
            existing_checksums.add(checksum)

        # Update last_scan_at
        watch_dir.last_scan_at = datetime.now(timezone.utc)

        return ingested
