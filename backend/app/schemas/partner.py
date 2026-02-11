"""Schemas for ODK integration, partner lab imports, canonical tests, stool kits."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import (
    MatchStatus,
    OdkProcessingStatus,
    OdkSyncStatus,
    PartnerName,
    StoolKitStatus,
)


# ---------------------------------------------------------------------------
# ODK Form Config
# ---------------------------------------------------------------------------

class OdkFormConfigCreate(BaseModel):
    form_id: str = Field(min_length=1, max_length=100)
    form_name: str = Field(min_length=1, max_length=200)
    form_version: str = Field(min_length=1, max_length=50)
    field_mapping: dict


class OdkFormConfigUpdate(BaseModel):
    form_name: str | None = None
    field_mapping: dict | None = None
    is_active: bool | None = None


class OdkFormConfigRead(BaseModel):
    id: uuid.UUID
    form_id: str
    form_name: str
    form_version: str
    field_mapping: dict
    is_active: bool
    created_at: datetime
    updated_by: uuid.UUID | None

    model_config = {"from_attributes": True}


class OdkSyncLogRead(BaseModel):
    id: uuid.UUID
    sync_started_at: datetime
    sync_completed_at: datetime | None
    status: OdkSyncStatus
    submissions_found: int | None
    submissions_processed: int | None
    submissions_failed: int | None
    error_message: str | None
    created_by: uuid.UUID | None

    model_config = {"from_attributes": True}


class OdkSubmissionRead(BaseModel):
    id: uuid.UUID
    odk_instance_id: str
    odk_form_id: str
    odk_form_version: str | None
    participant_id: uuid.UUID | None
    participant_code_raw: str | None
    submission_data: dict
    processed_at: datetime | None
    processing_status: OdkProcessingStatus | None
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OdkSyncTriggerRequest(BaseModel):
    form_id: str | None = None


# ---------------------------------------------------------------------------
# Canonical Tests
# ---------------------------------------------------------------------------

class CanonicalTestCreate(BaseModel):
    canonical_name: str = Field(min_length=1, max_length=200)
    display_name: str | None = None
    category: str | None = None
    standard_unit: str | None = None
    reference_range_low: Decimal | None = None
    reference_range_high: Decimal | None = None


class CanonicalTestUpdate(BaseModel):
    canonical_name: str | None = None
    display_name: str | None = None
    category: str | None = None
    standard_unit: str | None = None
    reference_range_low: Decimal | None = None
    reference_range_high: Decimal | None = None
    is_active: bool | None = None


class CanonicalTestRead(BaseModel):
    id: uuid.UUID
    canonical_name: str
    display_name: str | None
    category: str | None
    standard_unit: str | None
    reference_range_low: Decimal | None
    reference_range_high: Decimal | None
    is_active: bool
    created_at: datetime
    updated_by: uuid.UUID | None
    aliases_count: int = 0

    model_config = {"from_attributes": True}


class TestNameAliasCreate(BaseModel):
    partner_name: PartnerName
    alias_name: str = Field(min_length=1, max_length=200)
    alias_unit: str | None = None
    unit_conversion_factor: Decimal = Decimal("1.0")


class TestNameAliasRead(BaseModel):
    id: uuid.UUID
    canonical_test_id: uuid.UUID
    partner_name: PartnerName
    alias_name: str
    alias_unit: str | None
    unit_conversion_factor: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Partner Lab Import
# ---------------------------------------------------------------------------

class ImportPreviewRow(BaseModel):
    row_number: int
    participant_code_raw: str
    test_name_raw: str
    test_value: str | None = None
    matched_participant_id: uuid.UUID | None = None
    matched_test_id: uuid.UUID | None = None
    issues: list[str] = []


class ImportPreviewResponse(BaseModel):
    total_rows: int
    matched_rows: int
    unmatched_rows: int
    preview_rows: list[ImportPreviewRow]


class ImportConfigureRequest(BaseModel):
    field_mapping: dict
    test_name_mapping: dict[str, uuid.UUID] | None = None


class ImportExecuteResponse(BaseModel):
    import_id: uuid.UUID
    records_total: int
    records_matched: int
    records_failed: int


class PartnerLabImportRead(BaseModel):
    id: uuid.UUID
    partner_name: PartnerName
    import_date: datetime
    source_file_name: str | None
    source_file_path: str | None
    records_total: int | None
    records_matched: int | None
    records_failed: int | None
    imported_by: uuid.UUID
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PartnerLabResultRead(BaseModel):
    id: uuid.UUID
    import_id: uuid.UUID
    participant_id: uuid.UUID | None
    participant_code_raw: str | None
    test_date: date | None
    test_name_raw: str | None
    canonical_test_id: uuid.UUID | None
    test_value: str | None
    test_unit: str | None
    reference_range: str | None
    is_abnormal: bool | None
    raw_data: dict | None
    match_status: MatchStatus | None
    created_at: datetime
    canonical_test_name: str | None = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Stool Kit
# ---------------------------------------------------------------------------

class StoolKitCreate(BaseModel):
    participant_id: uuid.UUID
    field_event_id: uuid.UUID | None = None
    kit_code: str | None = None


class StoolKitUpdate(BaseModel):
    status: StoolKitStatus
    decodeage_pickup_date: date | None = None
    notes: str | None = None


class StoolKitRead(BaseModel):
    id: uuid.UUID
    participant_id: uuid.UUID
    field_event_id: uuid.UUID | None
    kit_code: str | None
    issued_at: datetime
    issued_by: uuid.UUID | None
    status: StoolKitStatus
    decodeage_pickup_date: date | None
    results_received_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
