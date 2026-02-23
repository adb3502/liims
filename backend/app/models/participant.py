"""Participant, collection site, and consent models."""

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
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel
from app.models.enums import AgeGroup, ConsentType, EnrollmentSource, Sex


class CollectionSite(BaseModel):
    __tablename__ = "collection_site"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    participant_range_start: Mapped[int] = mapped_column(Integer, nullable=False)
    participant_range_end: Mapped[int] = mapped_column(Integer, nullable=False)
    city: Mapped[str] = mapped_column(String(100), default="Bangalore", server_default="Bangalore")
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    participants: Mapped[list["Participant"]] = relationship(back_populates="collection_site")

    __table_args__ = (
        Index("ix_collection_site_code", "code"),
    )


class Participant(BaseModel):
    __tablename__ = "participant"

    participant_code: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False
    )
    group_code: Mapped[str] = mapped_column(String(5), nullable=False)
    participant_number: Mapped[int] = mapped_column(Integer, nullable=False)
    age_group: Mapped[AgeGroup] = mapped_column(nullable=False)
    sex: Mapped[Sex] = mapped_column(nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    collection_site_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_site.id"), nullable=False
    )
    enrollment_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    enrollment_source: Mapped[EnrollmentSource] = mapped_column(
        default=EnrollmentSource.ODK,
    )
    odk_submission_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    clinical_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    wave: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    completion_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=0, server_default="0", nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    collection_site: Mapped["CollectionSite"] = relationship(back_populates="participants")
    consents: Mapped[list["Consent"]] = relationship(back_populates="participant")
    samples: Mapped[list["Sample"]] = relationship(  # noqa: F821
        "Sample", back_populates="participant"
    )

    __table_args__ = (
        Index("ix_participant_code", "participant_code"),
        Index("ix_participant_group_code", "group_code"),
        Index("ix_participant_site", "collection_site_id"),
        Index("ix_participant_wave", "wave"),
        # pg_trgm GIN index for fuzzy search -- created in migration
    )


class Consent(BaseModel):
    __tablename__ = "consent"

    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("participant.id"), nullable=False
    )
    consent_type: Mapped[ConsentType] = mapped_column(nullable=False)
    consent_given: Mapped[bool] = mapped_column(nullable=False)
    consent_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_proxy: Mapped[bool] = mapped_column(default=False, server_default="false")
    witness_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    form_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    withdrawal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    withdrawal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id"), nullable=True
    )

    # Relationships
    participant: Mapped["Participant"] = relationship(back_populates="consents")

    __table_args__ = (
        Index("ix_consent_participant", "participant_id"),
        Index("ix_consent_type", "consent_type"),
    )
