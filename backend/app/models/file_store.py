"""Managed file store and watch directory models."""

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

    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(200), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    category: Mapped[FileCategory] = mapped_column(nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    associated_entity_type: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    associated_entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    is_processed: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    processing_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_managed_file_category", "category"),
        Index("ix_managed_file_entity", "associated_entity_type", "associated_entity_id"),
        Index("ix_managed_file_checksum", "checksum_sha256"),
    )


class WatchDirectory(BaseModelNoSoftDelete):
    __tablename__ = "watch_directory"

    directory_path: Mapped[str] = mapped_column(String(1000), nullable=False, unique=True)
    category: Mapped[FileCategory] = mapped_column(nullable=False)
    file_pattern: Mapped[str] = mapped_column(String(200), default="*", server_default="*")
    auto_process: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    last_scan_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
