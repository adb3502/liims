"""Storage hierarchy schemas: Freezer, Rack, Box, Position, Temperature Events."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import BoxMaterial, BoxType, FreezerEventType, FreezerType


# --- Freezer ---

class FreezerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    freezer_type: FreezerType
    location: str | None = None
    rack_count: int | None = None
    slots_per_rack: int | None = None
    notes: str | None = None


class FreezerUpdate(BaseModel):
    name: str | None = None
    freezer_type: FreezerType | None = None
    location: str | None = None
    rack_count: int | None = None
    slots_per_rack: int | None = None
    notes: str | None = None
    is_active: bool | None = None


class FreezerRead(BaseModel):
    id: uuid.UUID
    name: str
    freezer_type: FreezerType
    location: str | None
    total_capacity: int | None
    rack_count: int | None
    slots_per_rack: int | None
    is_active: bool
    notes: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    # Computed utilization fields (set by service layer)
    used_positions: int = 0
    total_positions: int = 0
    utilization_pct: float = 0.0

    model_config = {"from_attributes": True}


# --- StorageRack ---

class RackCreate(BaseModel):
    rack_name: str = Field(min_length=1, max_length=50)
    position_in_freezer: int | None = None
    capacity: int | None = None


class RackBatchCreate(BaseModel):
    count: int = Field(ge=1, le=100)
    label_prefix: str = "R"


class RackRead(BaseModel):
    id: uuid.UUID
    freezer_id: uuid.UUID
    rack_name: str
    position_in_freezer: int | None
    capacity: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- StorageBox ---

class BoxCreate(BaseModel):
    rack_id: uuid.UUID
    box_name: str = Field(min_length=1, max_length=100)
    box_label: str | None = None
    rows: int = Field(default=9, ge=1, le=20)
    columns: int = Field(default=9, ge=1, le=20)
    box_type: BoxType = BoxType.CRYO_81
    box_material: BoxMaterial | None = None
    position_in_rack: int | None = None
    group_code: str | None = Field(default=None, max_length=5)
    collection_site_id: uuid.UUID | None = None


class BoxUpdate(BaseModel):
    box_name: str | None = None
    box_label: str | None = None
    box_type: BoxType | None = None
    box_material: BoxMaterial | None = None
    position_in_rack: int | None = None
    group_code: str | None = None
    collection_site_id: uuid.UUID | None = None


class BoxRead(BaseModel):
    id: uuid.UUID
    rack_id: uuid.UUID
    box_name: str
    box_label: str | None
    rows: int
    columns: int
    box_type: BoxType
    box_material: BoxMaterial | None
    position_in_rack: int | None
    group_code: str | None
    collection_site_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    # Computed
    occupied_count: int = 0
    total_slots: int = 0

    model_config = {"from_attributes": True}


# --- StoragePosition ---

class PositionRead(BaseModel):
    id: uuid.UUID
    box_id: uuid.UUID
    row: int
    column: int
    sample_id: uuid.UUID | None
    occupied_at: datetime | None
    locked_by: uuid.UUID | None
    locked_at: datetime | None
    sample_code: str | None = None

    model_config = {"from_attributes": True}


class BoxDetail(BoxRead):
    """Box with all positions and sample info."""
    positions: list[PositionRead] = []


class PositionAssign(BaseModel):
    sample_id: uuid.UUID


class AutoAssignRequest(BaseModel):
    sample_id: uuid.UUID
    freezer_id: uuid.UUID
    group_code: str | None = None


class BulkAssignItem(BaseModel):
    sample_id: uuid.UUID
    position_id: uuid.UUID


class BulkAssignRequest(BaseModel):
    assignments: list[BulkAssignItem] = Field(min_length=1)


class ConsolidateRequest(BaseModel):
    target_box_id: uuid.UUID


# --- Temperature Events ---

class TempEventCreate(BaseModel):
    event_type: FreezerEventType
    event_start: datetime
    event_end: datetime | None = None
    observed_temp_c: Decimal | None = None
    samples_affected_count: int | None = None
    resolution_notes: str | None = None
    requires_sample_review: bool = True


class TempEventRead(BaseModel):
    id: uuid.UUID
    freezer_id: uuid.UUID
    event_type: FreezerEventType
    event_start: datetime
    event_end: datetime | None
    observed_temp_c: Decimal | None
    reported_by: uuid.UUID
    samples_affected_count: int | None
    resolution_notes: str | None
    requires_sample_review: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TempEventResolve(BaseModel):
    event_end: datetime | None = None
    resolution_notes: str
    requires_sample_review: bool | None = None


# --- Search result ---

class StorageSearchResult(BaseModel):
    sample_id: uuid.UUID
    sample_code: str
    position_id: uuid.UUID
    row: int
    column: int
    box_id: uuid.UUID
    box_name: str
    rack_id: uuid.UUID
    rack_name: str
    freezer_id: uuid.UUID
    freezer_name: str
