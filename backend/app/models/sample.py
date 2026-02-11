"""Sample, status history, discard request, and transport models."""

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
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, BaseModelNoSoftDelete
from app.models.enums import (
    DiscardReason,
    DiscardRequestStatus,
    SampleStatus,
    SampleType,
    TransportType,
)


class Sample(BaseModel):
    __tablename__ = "sample"

    sample_code: Mapped[str] = mapped_column(
        String(30), unique=True, nullable=False
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participant.id"), nullable=False
    )
    sample_type: Mapped[SampleType] = mapped_column(nullable=False)
    sample_subtype: Mapped[str | None] = mapped_column(String(10), nullable=True)
    parent_sample_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample.id"), nullable=True
    )
    status: Mapped[SampleStatus] = mapped_column(nullable=False)
    initial_volume_ul: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    remaining_volume_ul: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    collection_datetime: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    collected_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    collection_site_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_site.id"), nullable=True
    )
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    storage_location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("storage_position.id"), nullable=True
    )
    storage_datetime: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    stored_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    has_deviation: Mapped[bool] = mapped_column(default=False, server_default="false")
    deviation_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    qr_code_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    wave: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    participant: Mapped["Participant"] = relationship(  # noqa: F821
        "Participant", back_populates="samples"
    )
    parent_sample: Mapped["Sample | None"] = relationship(
        "Sample", remote_side="Sample.id", back_populates="aliquots"
    )
    aliquots: Mapped[list["Sample"]] = relationship(
        "Sample", back_populates="parent_sample"
    )
    status_history: Mapped[list["SampleStatusHistory"]] = relationship(
        back_populates="sample"
    )
    storage_position: Mapped["StoragePosition | None"] = relationship(  # noqa: F821
        "StoragePosition", foreign_keys=[storage_location_id]
    )

    __table_args__ = (
        Index("ix_sample_code", "sample_code"),
        Index("ix_sample_participant", "participant_id"),
        Index("ix_sample_type", "sample_type"),
        Index("ix_sample_status", "status"),
        Index("ix_sample_parent", "parent_sample_id"),
        Index("ix_sample_wave", "wave"),
        # pg_trgm GIN index for fuzzy search -- created in migration
    )


class SampleStatusHistory(BaseModelNoSoftDelete):
    __tablename__ = "sample_status_history"

    sample_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample.id"), nullable=False
    )
    previous_status: Mapped[SampleStatus | None] = mapped_column(nullable=True)
    new_status: Mapped[SampleStatus] = mapped_column(nullable=False)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    changed_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_context: Mapped[str | None] = mapped_column(String(200), nullable=True)
    storage_rule_override_reason: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    # Relationships
    sample: Mapped["Sample"] = relationship(back_populates="status_history")

    __table_args__ = (
        Index("ix_sample_status_history_sample", "sample_id"),
        Index("ix_sample_status_history_changed_at", "changed_at"),
    )


class SampleDiscardRequest(BaseModelNoSoftDelete):
    __tablename__ = "sample_discard_request"

    sample_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample.id"), nullable=False
    )
    requested_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    reason: Mapped[DiscardReason] = mapped_column(nullable=False)
    reason_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[DiscardRequestStatus] = mapped_column(
        default=DiscardRequestStatus.PENDING,
        server_default=DiscardRequestStatus.PENDING.value,
        nullable=False,
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_discard_request_sample", "sample_id"),
        Index("ix_discard_request_status", "status"),
    )


class SampleTransport(BaseModelNoSoftDelete):
    __tablename__ = "sample_transport"

    field_event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("field_event.id"), nullable=True
    )
    transport_type: Mapped[TransportType] = mapped_column(nullable=False)
    origin: Mapped[str] = mapped_column(String(200), nullable=False)
    destination: Mapped[str] = mapped_column(String(200), nullable=False)
    departure_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    arrival_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cold_chain_method: Mapped[str | None] = mapped_column(String(200), nullable=True)
    courier_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    sample_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    box_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=False
    )
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    items: Mapped[list["SampleTransportItem"]] = relationship(
        back_populates="transport"
    )

    __table_args__ = (
        Index("ix_transport_field_event", "field_event_id"),
    )


class SampleTransportItem(BaseModelNoSoftDelete):
    __tablename__ = "sample_transport_item"

    transport_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample_transport.id"), nullable=False
    )
    sample_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sample.id"), nullable=True
    )
    box_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("storage_box.id"), nullable=True
    )

    # Relationships
    transport: Mapped["SampleTransport"] = relationship(back_populates="items")

    __table_args__ = (
        Index("ix_transport_item_transport", "transport_id"),
    )
