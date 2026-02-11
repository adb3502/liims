"""Managed file store endpoints."""

import math
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.deps import require_role
from app.database import get_db
from app.models.enums import FileCategory, UserRole
from app.models.user import User
from app.schemas.file_store import (
    FileAssociateRequest,
    ManagedFileCreate,
    ManagedFileRead,
    WatchDirectoryCreate,
    WatchDirectoryRead,
)
from app.services.file_store import FileStoreService, WatchDirectoryService

router = APIRouter(prefix="/files", tags=["files"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)
WRITE_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
)
ADMIN_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
)

MAX_UPLOAD_BYTES = settings.FILE_STORE_MAX_SIZE_MB * 1024 * 1024


def _paginate_meta(page: int, per_page: int, total: int) -> dict:
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": math.ceil(total / per_page) if per_page else 0,
    }


# ── Watch Directories (static paths before /{file_id}) ────────────────

@router.get("/watch-dirs", response_model=dict)
async def list_watch_dirs(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    svc = WatchDirectoryService(db)
    items, total = await svc.list_watch_dirs(page=page, per_page=per_page)
    return {
        "success": True,
        "data": [WatchDirectoryRead.model_validate(w).model_dump(mode="json") for w in items],
        "meta": _paginate_meta(page, per_page, total),
    }


@router.post("/watch-dirs", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_watch_dir(
    data: WatchDirectoryCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    svc = WatchDirectoryService(db)
    watch_dir = await svc.create_watch_dir(data)
    return {
        "success": True,
        "data": WatchDirectoryRead.model_validate(watch_dir).model_dump(mode="json"),
    }


@router.post("/watch-dirs/{watch_dir_id}/scan", response_model=dict)
async def scan_watch_dir(
    watch_dir_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    svc = WatchDirectoryService(db)
    try:
        ingested = await svc.scan_directory(watch_dir_id, scanned_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": [ManagedFileRead.model_validate(f).model_dump(mode="json") for f in ingested],
        "meta": {"files_ingested": len(ingested)},
    }


# ── Upload (static path) ─────────────────────────────────────────────

@router.post("/upload", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
    category: FileCategory = Query(FileCategory.OTHER),
    associated_entity_type: str | None = Query(None, max_length=100),
    associated_entity_id: uuid.UUID | None = Query(None),
):
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No filename provided.")

    file_data = await file.read()

    if len(file_data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds maximum size of {settings.FILE_STORE_MAX_SIZE_MB} MB.",
        )

    content_type = file.content_type or "application/octet-stream"

    create_data = ManagedFileCreate(
        category=category,
        associated_entity_type=associated_entity_type,
        associated_entity_id=associated_entity_id,
    )

    svc = FileStoreService(db)
    try:
        managed_file = await svc.upload_file(
            file_data=file_data,
            original_filename=file.filename,
            content_type=content_type,
            data=create_data,
            uploaded_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    return {
        "success": True,
        "data": ManagedFileRead.model_validate(managed_file).model_dump(mode="json"),
    }


# ── File listing ─────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_files(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    category: FileCategory | None = None,
    associated_entity_type: str | None = None,
    associated_entity_id: uuid.UUID | None = None,
    sort: str = "created_at",
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    svc = FileStoreService(db)
    items, total = await svc.list_files(
        page=page, per_page=per_page, search=search,
        category=category,
        associated_entity_type=associated_entity_type,
        associated_entity_id=associated_entity_id,
        sort=sort, order=order,
    )
    return {
        "success": True,
        "data": [ManagedFileRead.model_validate(f).model_dump(mode="json") for f in items],
        "meta": _paginate_meta(page, per_page, total),
    }


# ── Parameterized file routes (after static paths) ───────────────────

@router.get("/{file_id}", response_model=dict)
async def get_file(
    file_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = FileStoreService(db)
    managed_file = await svc.get_file(file_id)
    if managed_file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found.")
    return {
        "success": True,
        "data": ManagedFileRead.model_validate(managed_file).model_dump(mode="json"),
    }


@router.get("/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = FileStoreService(db)
    managed_file = await svc.get_file(file_id)
    if managed_file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found.")

    file_path = Path(managed_file.storage_path)
    if not file_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found on disk.")

    return FileResponse(
        path=str(file_path),
        filename=managed_file.original_filename,
        media_type=managed_file.content_type,
    )


@router.delete("/{file_id}", response_model=dict)
async def delete_file(
    file_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    svc = FileStoreService(db)
    managed_file = await svc.delete_file(file_id, deleted_by=current_user.id)
    if managed_file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found.")
    return {
        "success": True,
        "data": ManagedFileRead.model_validate(managed_file).model_dump(mode="json"),
    }


@router.post("/{file_id}/associate", response_model=dict)
async def associate_file(
    file_id: uuid.UUID,
    data: FileAssociateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = FileStoreService(db)
    managed_file = await svc.associate_file(
        file_id,
        entity_type=data.associated_entity_type,
        entity_id=data.associated_entity_id,
        updated_by=current_user.id,
    )
    if managed_file is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found.")
    return {
        "success": True,
        "data": ManagedFileRead.model_validate(managed_file).model_dump(mode="json"),
    }
