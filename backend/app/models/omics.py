"""Omics result sets, individual results, and ICC processing models."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import UUIDPrimaryKeyMixin, TimestampMixin, Base
from app.models.enums import IccStatus, OmicsResultType


class OmicsResultSet(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "omics_result_set"

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instrument_run.id"), nullable=False
    )
    result_type: Mapped[OmicsResultType] = mapped_column(nullable=False)
    analysis_software: Mapped[str | None] = mapped_column(String(200), nullable=True)
    software_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    import_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    imported_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=False
    )
    source_file_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    total_features: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_samples: Mapped[int | None] = mapped_column(Integer, nullable=True)
    qc_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_omics_result_set_run", "run_id"),
        Index("ix_omics_result_set_type", "result_type"),
    )


class OmicsResult(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "omics_result"

    result_set_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("omics_result_set.id"), nullable=False
    )
    sample_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample.id"), nullable=False
    )
    feature_id: Mapped[str] = mapped_column(String(200), nullable=False)
    feature_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    quantification_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_imputed: Mapped[bool] = mapped_column(default=False, server_default="false")
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_omics_result_set_sample", "result_set_id", "sample_id"),
        Index("ix_omics_result_set_feature", "result_set_id", "feature_id"),
    )


class IccProcessing(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "icc_processing"

    sample_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample.id"), nullable=False
    )
    status: Mapped[IccStatus] = mapped_column(nullable=False)
    fixation_reagent: Mapped[str | None] = mapped_column(String(200), nullable=True)
    fixation_duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fixation_datetime: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    antibody_panel: Mapped[str | None] = mapped_column(String(500), nullable=True)
    secondary_antibody: Mapped[str | None] = mapped_column(String(500), nullable=True)
    microscope_settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    image_file_paths: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    analysis_software: Mapped[str] = mapped_column(
        String(100), default="Fiji/ImageJ", server_default="Fiji/ImageJ"
    )
    analysis_results: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    operator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_icc_sample", "sample_id"),
        Index("ix_icc_status", "status"),
    )
