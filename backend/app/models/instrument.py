"""Instrument, QC template, plate, run, and run-sample models."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, BaseModelNoSoftDelete, UUIDPrimaryKeyMixin, TimestampMixin, Base
from sqlalchemy import func
from app.models.enums import InstrumentType, QCStatus, RunStatus, RunType


class Instrument(BaseModel):
    __tablename__ = "instrument"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    instrument_type: Mapped[InstrumentType] = mapped_column(nullable=False)
    manufacturer: Mapped[str | None] = mapped_column(String(100), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    software: Mapped[str | None] = mapped_column(String(100), nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    watch_directory: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    configuration: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Relationships
    runs: Mapped[list["InstrumentRun"]] = relationship(back_populates="instrument")

    __table_args__ = (
        Index("ix_instrument_type", "instrument_type"),
    )


class QCTemplate(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "qc_template"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    run_type: Mapped[RunType | None] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )


class Plate(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "plate"

    plate_name: Mapped[str] = mapped_column(String(200), nullable=False)
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instrument_run.id"), nullable=True
    )
    qc_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("qc_template.id"), nullable=True
    )
    rows: Mapped[int] = mapped_column(Integer, default=8, server_default="8")
    columns: Mapped[int] = mapped_column(Integer, default=12, server_default="12")
    randomization_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    run: Mapped["InstrumentRun | None"] = relationship(back_populates="plates")
    run_samples: Mapped[list["InstrumentRunSample"]] = relationship(
        back_populates="plate"
    )

    __table_args__ = (
        Index("ix_plate_run", "run_id"),
    )


class InstrumentRun(BaseModel):
    __tablename__ = "instrument_run"

    instrument_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instrument.id"), nullable=False
    )
    run_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    run_type: Mapped[RunType | None] = mapped_column(nullable=True)
    status: Mapped[RunStatus] = mapped_column(nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    method_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    batch_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_data_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    raw_data_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    raw_data_verified: Mapped[bool] = mapped_column(
        default=False, server_default="false"
    )
    qc_status: Mapped[QCStatus | None] = mapped_column(nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    instrument: Mapped["Instrument"] = relationship(back_populates="runs")
    plates: Mapped[list["Plate"]] = relationship(back_populates="run")
    run_samples: Mapped[list["InstrumentRunSample"]] = relationship(
        back_populates="run"
    )

    __table_args__ = (
        Index("ix_run_instrument", "instrument_id"),
        Index("ix_run_status", "status"),
        Index("ix_run_type", "run_type"),
    )


class InstrumentRunSample(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "instrument_run_sample"

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instrument_run.id"), nullable=False
    )
    sample_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample.id"), nullable=False
    )
    plate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plate.id"), nullable=True
    )
    well_position: Mapped[str | None] = mapped_column(String(10), nullable=True)
    plate_number: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    sample_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_qc_sample: Mapped[bool] = mapped_column(default=False, server_default="false")
    qc_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    injection_volume_ul: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    volume_withdrawn_ul: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    run: Mapped["InstrumentRun"] = relationship(back_populates="run_samples")
    plate: Mapped["Plate | None"] = relationship(back_populates="run_samples")

    __table_args__ = (
        Index("ix_run_sample_run", "run_id"),
        Index("ix_run_sample_sample", "sample_id"),
    )
