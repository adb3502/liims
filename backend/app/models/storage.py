"""Storage hierarchy: Freezer, Rack, Box, Position, and temperature events."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, BaseModelNoSoftDelete, UUIDPrimaryKeyMixin, Base
from app.models.enums import BoxMaterial, BoxType, FreezerEventType, FreezerType


class Freezer(BaseModel):
    __tablename__ = "freezer"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    freezer_type: Mapped[FreezerType] = mapped_column(nullable=False)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    total_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rack_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    slots_per_rack: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    racks: Mapped[list["StorageRack"]] = relationship(back_populates="freezer")
    temperature_events: Mapped[list["FreezerTemperatureEvent"]] = relationship(
        back_populates="freezer"
    )

    __table_args__ = (
        Index("ix_freezer_type", "freezer_type"),
    )


class FreezerTemperatureEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "freezer_temperature_event"

    freezer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("freezer.id"), nullable=False
    )
    event_type: Mapped[FreezerEventType] = mapped_column(nullable=False)
    event_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    event_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    observed_temp_c: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 1), nullable=True
    )
    reported_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=False
    )
    samples_affected_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    requires_sample_review: Mapped[bool] = mapped_column(
        default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    freezer: Mapped["Freezer"] = relationship(back_populates="temperature_events")

    __table_args__ = (
        Index("ix_temp_event_freezer", "freezer_id"),
        Index("ix_temp_event_start", "event_start"),
    )


class StorageRack(BaseModel):
    __tablename__ = "storage_rack"

    freezer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("freezer.id"), nullable=False
    )
    rack_name: Mapped[str] = mapped_column(String(50), nullable=False)
    position_in_freezer: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Relationships
    freezer: Mapped["Freezer"] = relationship(back_populates="racks")
    boxes: Mapped[list["StorageBox"]] = relationship(back_populates="rack")

    __table_args__ = (
        Index("ix_rack_freezer", "freezer_id"),
    )


class StorageBox(BaseModel):
    __tablename__ = "storage_box"

    rack_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("storage_rack.id"), nullable=False
    )
    box_name: Mapped[str] = mapped_column(String(100), nullable=False)
    box_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    rows: Mapped[int] = mapped_column(Integer, default=9, server_default="9", nullable=False)
    columns: Mapped[int] = mapped_column(Integer, default=9, server_default="9", nullable=False)
    box_type: Mapped[BoxType] = mapped_column(
        default=BoxType.CRYO_81, server_default=BoxType.CRYO_81.value
    )
    box_material: Mapped[BoxMaterial | None] = mapped_column(nullable=True)
    position_in_rack: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_code: Mapped[str | None] = mapped_column(String(5), nullable=True)
    collection_site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_site.id"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    rack: Mapped["StorageRack"] = relationship(back_populates="boxes")
    positions: Mapped[list["StoragePosition"]] = relationship(back_populates="box")

    __table_args__ = (
        Index("ix_box_rack", "rack_id"),
        Index("ix_box_group_code", "group_code"),
    )


class StoragePosition(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "storage_position"

    box_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("storage_box.id"), nullable=False
    )
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    column: Mapped[int] = mapped_column(Integer, nullable=False)
    sample_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample.id"), nullable=True
    )
    occupied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    locked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    locked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    box: Mapped["StorageBox"] = relationship(back_populates="positions")

    __table_args__ = (
        UniqueConstraint("box_id", "row", "column", name="uq_box_row_col"),
        Index("ix_position_box", "box_id"),
        Index("ix_position_sample", "sample_id"),
    )
