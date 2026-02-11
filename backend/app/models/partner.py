"""Partner integration: ODK, partner lab imports, canonical tests, stool kits."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, BaseModelNoSoftDelete, UUIDPrimaryKeyMixin, TimestampMixin, Base
from app.models.enums import (
    MatchStatus,
    OdkProcessingStatus,
    OdkSyncStatus,
    PartnerName,
    StoolKitStatus,
)


# --- ODK Integration ---


class OdkFormConfig(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "odk_form_config"

    form_id: Mapped[str] = mapped_column(String(100), nullable=False)
    form_name: Mapped[str] = mapped_column(String(200), nullable=False)
    form_version: Mapped[str] = mapped_column(String(50), nullable=False)
    field_mapping: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    __table_args__ = (
        Index("ix_odk_form_config_form_id", "form_id"),
    )


class OdkSyncLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "odk_sync_log"

    sync_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    sync_completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[OdkSyncStatus] = mapped_column(nullable=False)
    submissions_found: Mapped[int | None] = mapped_column(Integer, nullable=True)
    submissions_processed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    submissions_failed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    __table_args__ = (
        Index("ix_odk_sync_log_status", "status"),
        Index("ix_odk_sync_log_started", "sync_started_at"),
    )


class OdkSubmission(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "odk_submission"

    odk_instance_id: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False
    )
    odk_form_id: Mapped[str] = mapped_column(String(100), nullable=False)
    odk_form_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    participant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participant.id"), nullable=True
    )
    participant_code_raw: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    submission_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_status: Mapped[OdkProcessingStatus | None] = mapped_column(
        nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_odk_submission_instance", "odk_instance_id"),
        Index("ix_odk_submission_participant", "participant_id"),
        Index("ix_odk_submission_status", "processing_status"),
    )


# --- Canonical Test Dictionary ---


class CanonicalTest(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "canonical_test"

    canonical_name: Mapped[str] = mapped_column(
        String(200), unique=True, nullable=False
    )
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    standard_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference_range_low: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 4), nullable=True
    )
    reference_range_high: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 4), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    aliases: Mapped[list["TestNameAlias"]] = relationship(back_populates="canonical_test")

    __table_args__ = (
        Index("ix_canonical_test_name", "canonical_name"),
        Index("ix_canonical_test_category", "category"),
    )


class TestNameAlias(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "test_name_alias"

    canonical_test_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canonical_test.id"), nullable=False
    )
    partner_name: Mapped[PartnerName] = mapped_column(nullable=False)
    alias_name: Mapped[str] = mapped_column(String(200), nullable=False)
    alias_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unit_conversion_factor: Mapped[Decimal] = mapped_column(
        Numeric(10, 6), default=1.0, server_default="1.0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    canonical_test: Mapped["CanonicalTest"] = relationship(back_populates="aliases")

    __table_args__ = (
        Index("ix_alias_canonical_test", "canonical_test_id"),
        Index("ix_alias_partner", "partner_name"),
    )


# --- Partner Lab Results ---


class PartnerLabImport(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "partner_lab_import"

    partner_name: Mapped[PartnerName] = mapped_column(nullable=False)
    import_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    source_file_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_file_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    records_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    records_matched: Mapped[int | None] = mapped_column(Integer, nullable=True)
    records_failed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    imported_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    results: Mapped[list["PartnerLabResult"]] = relationship(back_populates="import_record")

    __table_args__ = (
        Index("ix_partner_import_partner", "partner_name"),
        Index("ix_partner_import_date", "import_date"),
    )


class PartnerLabResult(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "partner_lab_result"

    import_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("partner_lab_import.id"), nullable=False
    )
    participant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participant.id"), nullable=True
    )
    participant_code_raw: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    test_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    test_name_raw: Mapped[str | None] = mapped_column(String(200), nullable=True)
    canonical_test_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canonical_test.id"), nullable=True
    )
    test_value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    test_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_abnormal: Mapped[bool | None] = mapped_column(nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    match_status: Mapped[MatchStatus | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    import_record: Mapped["PartnerLabImport"] = relationship(back_populates="results")

    __table_args__ = (
        Index("ix_partner_result_import", "import_id"),
        Index("ix_partner_result_participant", "participant_id"),
        Index("ix_partner_result_test", "canonical_test_id"),
    )


# --- Stool Kit Tracking ---


class StoolKit(BaseModel):
    __tablename__ = "stool_kit"

    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participant.id"), nullable=False
    )
    field_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("field_event.id"), nullable=True
    )
    kit_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    issued_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    status: Mapped[StoolKitStatus] = mapped_column(
        default=StoolKitStatus.ISSUED,
        server_default=StoolKitStatus.ISSUED.value,
        nullable=False,
    )
    decodeage_pickup_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    results_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_stool_kit_participant", "participant_id"),
        Index("ix_stool_kit_status", "status"),
    )
