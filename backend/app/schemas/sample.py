"""Sample, status history, discard, and transport request/response schemas."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import (
    DiscardReason,
    DiscardRequestStatus,
    SampleStatus,
    SampleType,
    TransportType,
)


# --- Sample ---

class SampleCreate(BaseModel):
    participant_id: uuid.UUID
    sample_type: SampleType
    sample_subtype: str | None = None
    parent_sample_id: uuid.UUID | None = None
    initial_volume_ul: Decimal | None = None
    collection_site_id: uuid.UUID | None = None
    wave: int = 1
    notes: str | None = None


class SampleUpdate(BaseModel):
    notes: str | None = None
    has_deviation: bool | None = None
    deviation_notes: str | None = None


class SampleStatusUpdate(BaseModel):
    status: SampleStatus
    notes: str | None = None
    location_context: str | None = None
    storage_rule_override_reason: str | None = None


class VolumeWithdrawRequest(BaseModel):
    volume_ul: Decimal = Field(gt=0)
    reason: str | None = None


class SampleRead(BaseModel):
    id: uuid.UUID
    sample_code: str
    participant_id: uuid.UUID
    sample_type: SampleType
    sample_subtype: str | None
    parent_sample_id: uuid.UUID | None
    status: SampleStatus
    initial_volume_ul: Decimal | None
    remaining_volume_ul: Decimal | None
    collection_datetime: datetime | None
    processing_started_at: datetime | None
    storage_location_id: uuid.UUID | None
    has_deviation: bool
    deviation_notes: str | None
    qr_code_url: str | None
    notes: str | None
    wave: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SampleDetail(SampleRead):
    """Extended sample with history, aliquots, and storage info."""
    status_history: list["StatusHistoryRead"] = []
    aliquots: list["SampleRead"] = []
    processing_elapsed_seconds: int | None = None


class StatusHistoryRead(BaseModel):
    id: uuid.UUID
    sample_id: uuid.UUID
    previous_status: SampleStatus | None
    new_status: SampleStatus
    changed_at: datetime
    changed_by: uuid.UUID
    notes: str | None
    location_context: str | None
    storage_rule_override_reason: str | None

    model_config = {"from_attributes": True}


# --- Discard ---

class DiscardRequestCreate(BaseModel):
    reason: DiscardReason
    reason_notes: str | None = None


class DiscardRequestRead(BaseModel):
    id: uuid.UUID
    sample_id: uuid.UUID
    requested_by: uuid.UUID
    requested_at: datetime
    reason: DiscardReason
    reason_notes: str | None
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    status: DiscardRequestStatus
    rejection_reason: str | None

    model_config = {"from_attributes": True}


class DiscardApprovalRequest(BaseModel):
    approved: bool
    rejection_reason: str | None = None


# --- Transport ---

class TransportItemCreate(BaseModel):
    sample_id: uuid.UUID | None = None
    box_id: uuid.UUID | None = None


class TransportCreate(BaseModel):
    field_event_id: uuid.UUID | None = None
    transport_type: TransportType
    origin: str = Field(min_length=1)
    destination: str = Field(min_length=1)
    departure_time: datetime | None = None
    cold_chain_method: str | None = None
    courier_name: str | None = None
    notes: str | None = None
    items: list[TransportItemCreate] = []


class TransportRead(BaseModel):
    id: uuid.UUID
    transport_type: TransportType
    origin: str
    destination: str
    departure_time: datetime | None
    arrival_time: datetime | None
    cold_chain_method: str | None
    courier_name: str | None
    sample_count: int | None
    box_count: int | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
