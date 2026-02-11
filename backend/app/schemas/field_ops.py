"""Field event and participant check-in request/response schemas."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import (
    FieldEventStatus,
    FieldEventType,
    PartnerName,
    SyncStatus,
)


# --- Field Event ---

class FieldEventCreate(BaseModel):
    event_name: str = Field(min_length=1, max_length=200)
    event_date: date
    collection_site_id: uuid.UUID
    event_type: FieldEventType
    expected_participants: int | None = None
    coordinator_id: uuid.UUID | None = None
    partner_lab: PartnerName | None = None
    notes: str | None = None
    wave: int = 1


class FieldEventUpdate(BaseModel):
    event_name: str | None = Field(default=None, min_length=1, max_length=200)
    event_date: date | None = None
    collection_site_id: uuid.UUID | None = None
    event_type: FieldEventType | None = None
    expected_participants: int | None = None
    coordinator_id: uuid.UUID | None = None
    partner_lab: PartnerName | None = None
    notes: str | None = None
    wave: int | None = None
    status: FieldEventStatus | None = None


class FieldEventRead(BaseModel):
    id: uuid.UUID
    event_name: str
    event_date: date
    collection_site_id: uuid.UUID
    event_type: FieldEventType
    expected_participants: int | None
    actual_participants: int | None
    status: FieldEventStatus | None
    coordinator_id: uuid.UUID | None
    partner_lab: PartnerName | None
    notes: str | None
    wave: int
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EventParticipantRead(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    participant_id: uuid.UUID
    check_in_time: datetime | None
    wrist_tag_issued: bool
    consent_verified: bool
    samples_collected: dict | None
    partner_samples: dict | None
    stool_kit_issued: bool
    urine_collected: bool
    notes: str | None
    recorded_by: uuid.UUID | None
    recorded_at: datetime | None
    sync_status: SyncStatus
    offline_id: str | None
    # Computed: set by service layer when joining with participant
    participant_code: str | None = None

    model_config = {"from_attributes": True}


class FieldEventDetail(FieldEventRead):
    """Field event with full participant roster."""
    event_participants: list[EventParticipantRead] = []


# --- Participant Management ---

class EventParticipantCreate(BaseModel):
    participant_id: uuid.UUID


class EventParticipantBulkAdd(BaseModel):
    participant_ids: list[uuid.UUID] = Field(min_length=1)


class CheckInRequest(BaseModel):
    participant_id: uuid.UUID
    wrist_tag_issued: bool = True
    consent_verified: bool = True
    notes: str | None = None


# --- Bulk Digitization ---

class BulkDigitizeItem(BaseModel):
    participant_id: uuid.UUID
    check_in_time: datetime | None = None
    samples_collected: dict | None = None
    partner_samples: dict | None = None
    stool_kit_issued: bool = False
    urine_collected: bool = False
    notes: str | None = None


class BulkDigitizeRequest(BaseModel):
    items: list[BulkDigitizeItem] = Field(min_length=1)


# --- Sync / Conflict Resolution ---

class SyncConflict(BaseModel):
    participant_id: uuid.UUID
    event_id: uuid.UUID
    offline_id: str | None
    field: str
    server_value: str | None
    client_value: str | None


class SyncResolveRequest(BaseModel):
    offline_id: str
    resolution: str = Field(description="'server' or 'client'")
    field: str | None = None
