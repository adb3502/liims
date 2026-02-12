"""Field event and participant check-in models."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, UUIDPrimaryKeyMixin, TimestampMixin, Base
from app.models.enums import FieldEventStatus, FieldEventType, PartnerName, SyncStatus


class FieldEvent(BaseModel):
    __tablename__ = "field_event"

    event_name: Mapped[str] = mapped_column(String(200), nullable=False)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    collection_site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_site.id"), nullable=False
    )
    event_type: Mapped[FieldEventType] = mapped_column(nullable=False)
    expected_participants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actual_participants: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[FieldEventStatus | None] = mapped_column(nullable=True)
    coordinator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    partner_lab: Mapped[PartnerName | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    wave: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    event_participants: Mapped[list["FieldEventParticipant"]] = relationship(
        back_populates="event"
    )

    __table_args__ = (
        Index("ix_field_event_date", "event_date"),
        Index("ix_field_event_site", "collection_site_id"),
        Index("ix_field_event_status", "status"),
    )


class FieldEventParticipant(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "field_event_participant"

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("field_event.id"), nullable=False
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participant.id"), nullable=False
    )
    check_in_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    wrist_tag_issued: Mapped[bool] = mapped_column(default=False, server_default="false")
    consent_verified: Mapped[bool] = mapped_column(default=False, server_default="false")
    samples_collected: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    partner_samples: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    stool_kit_issued: Mapped[bool] = mapped_column(default=False, server_default="false")
    urine_collected: Mapped[bool] = mapped_column(default=False, server_default="false")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )
    recorded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sync_status: Mapped[SyncStatus] = mapped_column(
        default=SyncStatus.SYNCED,
    )
    offline_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relationships
    event: Mapped["FieldEvent"] = relationship(back_populates="event_participants")

    __table_args__ = (
        UniqueConstraint("event_id", "participant_id", name="uq_event_participant"),
        Index("ix_fep_event", "event_id"),
        Index("ix_fep_participant", "participant_id"),
    )
