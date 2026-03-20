"""Base model mixin with UUID primary key, timestamps, and soft delete."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.enums import (
    AgeGroup,
    AuditAction, BoxMaterial, BoxType, ConsentType,
    DashboardType, DiscardReason, DiscardRequestStatus, EnrollmentDateSource,
    EnrollmentSource, FieldEventStatus, FieldEventType, FileCategory,
    FreezerEventType, FreezerType, IccStatus, InstrumentType, MatchStatus,
    NotificationSeverity, NotificationType, OdkProcessingStatus, OdkSyncStatus,
    OdkTriggerType, OmicsResultType, PartnerName, QCStatus, ReportType,
    RunStatus, RunType, SampleStatus, SampleType, SettingValueType, Sex,
    StoolKitStatus, SyncStatus, TransportType, UserRole,
)

# AgeGroup is int enum — stored as INTEGER in PostgreSQL.
# All other enums are str enums — stored as VARCHAR(50).
Base.registry.update_type_annotation_map(
    {
        AgeGroup: Integer(),
        **{
            t: String(50)
            for t in (
                AuditAction, BoxMaterial, BoxType, ConsentType,
                DashboardType, DiscardReason, DiscardRequestStatus, EnrollmentDateSource,
                EnrollmentSource, FieldEventStatus, FieldEventType, FileCategory,
                FreezerEventType, FreezerType, IccStatus, InstrumentType, MatchStatus,
                NotificationSeverity, NotificationType, OdkProcessingStatus, OdkSyncStatus,
                OdkTriggerType, OmicsResultType, PartnerName, QCStatus, ReportType,
                RunStatus, RunType, SampleStatus, SampleType, SettingValueType, Sex,
                StoolKitStatus, SyncStatus, TransportType, UserRole,
            )
        },
    }
)


class TimestampMixin:
    """Adds created_at and updated_at columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """Adds is_deleted and deleted_at columns."""

    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class UUIDPrimaryKeyMixin:
    """Adds a UUID v4 primary key."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class BaseModel(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Full base model with UUID PK, timestamps, and soft delete.

    Use for most entities.
    """

    __abstract__ = True


class BaseModelNoSoftDelete(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Base model without soft delete.

    Use for log/history tables that should never be soft-deleted.
    """

    __abstract__ = True
