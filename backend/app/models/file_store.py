"""Managed file store and watch directory models.

Files live on the NAS and are discovered by periodic scans of watch directories.
Only metadata is stored in the database; file content is never served via API.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseModel, BaseModelNoSoftDelete
from app.models.enums import FileCategory


class ManagedFile(BaseModel):
    __tablename__ = "managed_file"

    file_path: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(200), nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[FileCategory] = mapped_column(nullable=False)
    instrument_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instrument.id"), nullable=True
    )
    discovered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    processed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    entity_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_managed_file_category", "category"),
        Index("ix_managed_file_instrument", "instrument_id"),
        Index("ix_managed_file_entity", "entity_type", "entity_id"),
        Index("ix_managed_file_checksum", "checksum_sha256"),
        Index("ix_managed_file_discovered", "discovered_at"),
    )


class WatchDirectory(BaseModelNoSoftDelete):
    __tablename__ = "watch_directory"

    path: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)
    instrument_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instrument.id"), nullable=True
    )
    file_pattern: Mapped[str] = mapped_column(
        String(200), default="*", server_default="*"
    )
    category: Mapped[FileCategory] = mapped_column(
        nullable=False, default=FileCategory.INSTRUMENT_OUTPUT
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    last_scanned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
