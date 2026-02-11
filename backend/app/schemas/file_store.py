"""File store and watch directory schemas.

Only metadata is exposed via API; file content is never served to the browser.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import FileCategory


# -- ManagedFile --

class ManagedFileRead(BaseModel):
    id: uuid.UUID
    file_path: str
    file_name: str
    file_size: int
    mime_type: str
    checksum_sha256: str
    category: FileCategory
    instrument_id: uuid.UUID | None
    discovered_at: datetime
    processed: bool
    processed_at: datetime | None
    entity_type: str | None
    entity_id: uuid.UUID | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ManagedFileCreate(BaseModel):
    """Internal-only schema used when scan discovers a new file."""
    file_path: str = Field(min_length=1, max_length=1000)
    file_name: str = Field(min_length=1, max_length=500)
    file_size: int = Field(ge=0)
    mime_type: str = Field(max_length=200)
    checksum_sha256: str = Field(min_length=64, max_length=64)
    category: FileCategory = FileCategory.INSTRUMENT_OUTPUT
    instrument_id: uuid.UUID | None = None


class FileAssociateRequest(BaseModel):
    associated_entity_type: str = Field(min_length=1, max_length=100)
    associated_entity_id: uuid.UUID


class FileUpdateNotes(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)


# -- WatchDirectory --

class WatchDirectoryCreate(BaseModel):
    path: str = Field(min_length=1, max_length=1000)
    instrument_id: uuid.UUID | None = None
    file_pattern: str = Field(default="*", max_length=200)
    category: FileCategory = FileCategory.INSTRUMENT_OUTPUT


class WatchDirectoryRead(BaseModel):
    id: uuid.UUID
    path: str
    instrument_id: uuid.UUID | None
    file_pattern: str
    category: FileCategory
    is_active: bool
    last_scanned_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WatchDirectoryUpdate(BaseModel):
    instrument_id: uuid.UUID | None = None
    file_pattern: str | None = Field(default=None, max_length=200)
    category: FileCategory | None = None
    is_active: bool | None = None
