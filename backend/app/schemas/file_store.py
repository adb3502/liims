"""File store and watch directory schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import FileCategory


# -- ManagedFile --

class ManagedFileCreate(BaseModel):
    category: FileCategory = FileCategory.OTHER
    associated_entity_type: str | None = Field(default=None, max_length=100)
    associated_entity_id: uuid.UUID | None = None


class ManagedFileRead(BaseModel):
    id: uuid.UUID
    filename: str
    original_filename: str
    content_type: str
    file_size: int
    storage_path: str
    category: FileCategory
    uploaded_by: uuid.UUID | None
    associated_entity_type: str | None
    associated_entity_id: uuid.UUID | None
    checksum_sha256: str
    is_processed: bool
    processing_notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FileAssociateRequest(BaseModel):
    associated_entity_type: str = Field(min_length=1, max_length=100)
    associated_entity_id: uuid.UUID


# -- WatchDirectory --

class WatchDirectoryCreate(BaseModel):
    directory_path: str = Field(min_length=1, max_length=1000)
    category: FileCategory = FileCategory.OTHER
    file_pattern: str = Field(default="*", max_length=200)
    auto_process: bool = False


class WatchDirectoryRead(BaseModel):
    id: uuid.UUID
    directory_path: str
    category: FileCategory
    file_pattern: str
    auto_process: bool
    is_active: bool
    last_scan_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
