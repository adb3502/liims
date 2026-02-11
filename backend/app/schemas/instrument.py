"""Instrument, plate, run, omics result, and ICC schemas."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import (
    IccStatus,
    InstrumentType,
    OmicsResultType,
    QCStatus,
    RunStatus,
    RunType,
)


# ── Instrument ────────────────────────────────────────────────────────

class InstrumentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    instrument_type: InstrumentType
    manufacturer: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    software: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)
    watch_directory: str | None = Field(default=None, max_length=1000)
    configuration: dict | None = None


class InstrumentUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    instrument_type: InstrumentType | None = None
    manufacturer: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    software: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)
    watch_directory: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None
    configuration: dict | None = None


class InstrumentRead(BaseModel):
    id: uuid.UUID
    name: str
    instrument_type: InstrumentType
    manufacturer: str | None
    model: str | None
    software: str | None
    location: str | None
    watch_directory: str | None
    is_active: bool
    configuration: dict | None
    created_by: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── QC Template ───────────────────────────────────────────────────────

class QCTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    template_data: dict
    run_type: RunType | None = None


class QCTemplateRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    template_data: dict
    run_type: RunType | None
    is_active: bool
    created_at: datetime
    created_by: uuid.UUID | None

    model_config = {"from_attributes": True}


# ── Plate ─────────────────────────────────────────────────────────────

class PlateCreate(BaseModel):
    plate_name: str = Field(min_length=1, max_length=200)
    run_id: uuid.UUID | None = None
    qc_template_id: uuid.UUID | None = None
    rows: int = Field(default=8, ge=1, le=32)
    columns: int = Field(default=12, ge=1, le=48)
    randomization_config: dict | None = None


class PlateRead(BaseModel):
    id: uuid.UUID
    plate_name: str
    run_id: uuid.UUID | None
    qc_template_id: uuid.UUID | None
    rows: int
    columns: int
    randomization_config: dict | None
    created_at: datetime
    created_by: uuid.UUID | None

    model_config = {"from_attributes": True}


class RunSampleRead(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    sample_id: uuid.UUID
    plate_id: uuid.UUID | None
    well_position: str | None
    plate_number: int
    sample_order: int | None
    is_qc_sample: bool
    qc_type: str | None
    injection_volume_ul: Decimal | None
    volume_withdrawn_ul: Decimal | None
    created_at: datetime
    # Joined fields (optional, set by service)
    sample_code: str | None = None

    model_config = {"from_attributes": True}


class PlateDetail(PlateRead):
    """Plate with all well assignments."""
    wells: list[RunSampleRead] = []


# ── Well Assignment ───────────────────────────────────────────────────

class WellAssignment(BaseModel):
    sample_id: uuid.UUID
    well_position: str = Field(min_length=1, max_length=10)
    is_qc_sample: bool = False
    qc_type: str | None = None
    injection_volume_ul: Decimal | None = None
    volume_withdrawn_ul: Decimal | None = None


class WellAssignRequest(BaseModel):
    assignments: list[WellAssignment] = Field(min_length=1)


# ── Plate Randomization ──────────────────────────────────────────────

class PlateRandomizeRequest(BaseModel):
    """Request to randomize sample placement on a plate.

    sample_ids: list of sample UUIDs to place on the plate.
    stratify_by: variables to stratify by (e.g., ["age_group", "sex", "collection_site"]).
    qc_template_id: optional QC template to insert QC/blank wells.
    injection_volume_ul: default volume per well.
    """
    sample_ids: list[uuid.UUID] = Field(min_length=1)
    stratify_by: list[str] = Field(default_factory=list)
    qc_template_id: uuid.UUID | None = None
    injection_volume_ul: Decimal | None = None


# ── Plate Grid ────────────────────────────────────────────────────────

class PlateGridCell(BaseModel):
    well_position: str
    row_label: str  # "A", "B", ...
    column_number: int  # 1, 2, ...
    sample_id: uuid.UUID | None = None
    sample_code: str | None = None
    is_qc_sample: bool = False
    qc_type: str | None = None


class PlateGridResponse(BaseModel):
    plate_id: uuid.UUID
    plate_name: str
    rows: int
    columns: int
    grid: list[PlateGridCell] = []


# ── TECAN Worklist ────────────────────────────────────────────────────

class TecanWorklistRow(BaseModel):
    source_rack: str
    source_position: str
    dest_rack: str
    dest_position: str
    volume_ul: Decimal


class TecanWorklistResponse(BaseModel):
    plate_id: uuid.UUID
    plate_name: str
    row_count: int
    rows: list[TecanWorklistRow] = []


# ── Instrument Run ────────────────────────────────────────────────────

class InstrumentRunCreate(BaseModel):
    instrument_id: uuid.UUID
    run_name: str | None = Field(default=None, max_length=200)
    run_type: RunType | None = None
    method_name: str | None = Field(default=None, max_length=200)
    batch_id: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class InstrumentRunUpdate(BaseModel):
    run_name: str | None = Field(default=None, max_length=200)
    run_type: RunType | None = None
    method_name: str | None = Field(default=None, max_length=200)
    batch_id: str | None = Field(default=None, max_length=100)
    notes: str | None = None
    raw_data_path: str | None = Field(default=None, max_length=1000)
    raw_data_size_bytes: int | None = None
    raw_data_verified: bool | None = None
    qc_status: QCStatus | None = None


class InstrumentRunRead(BaseModel):
    id: uuid.UUID
    instrument_id: uuid.UUID
    run_name: str | None
    run_type: RunType | None
    status: RunStatus
    started_at: datetime | None
    completed_at: datetime | None
    operator_id: uuid.UUID | None
    method_name: str | None
    batch_id: str | None
    notes: str | None
    raw_data_path: str | None
    raw_data_size_bytes: int | None
    raw_data_verified: bool
    qc_status: QCStatus | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    # Joined fields
    instrument_name: str | None = None
    plate_count: int = 0
    sample_count: int = 0

    model_config = {"from_attributes": True}


# ── Run Results Upload ────────────────────────────────────────────────

class RunResultItem(BaseModel):
    sample_id: uuid.UUID
    feature_id: str = Field(max_length=200)
    feature_name: str | None = Field(default=None, max_length=500)
    quantification_value: float | None = None
    is_imputed: bool = False
    confidence_score: float | None = None


class RunResultsUpload(BaseModel):
    result_type: OmicsResultType
    analysis_software: str | None = Field(default=None, max_length=200)
    software_version: str | None = Field(default=None, max_length=50)
    source_file_path: str | None = Field(default=None, max_length=1000)
    notes: str | None = None
    results: list[RunResultItem] = Field(min_length=1)


# ── Omics Result Set / Result ─────────────────────────────────────────

class OmicsResultSetRead(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    result_type: OmicsResultType
    analysis_software: str | None
    software_version: str | None
    import_date: datetime
    imported_by: uuid.UUID
    source_file_path: str | None
    total_features: int | None
    total_samples: int | None
    qc_summary: dict | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OmicsResultRead(BaseModel):
    id: uuid.UUID
    result_set_id: uuid.UUID
    sample_id: uuid.UUID
    feature_id: str
    feature_name: str | None
    quantification_value: float | None
    is_imputed: bool
    confidence_score: float | None
    created_at: datetime
    # Joined fields
    sample_code: str | None = None

    model_config = {"from_attributes": True}


# ── ICC Processing ────────────────────────────────────────────────────

class IccProcessingCreate(BaseModel):
    sample_id: uuid.UUID
    status: IccStatus = IccStatus.RECEIVED
    fixation_reagent: str | None = Field(default=None, max_length=200)
    fixation_duration_min: int | None = None
    antibody_panel: str | None = Field(default=None, max_length=500)
    secondary_antibody: str | None = Field(default=None, max_length=500)
    notes: str | None = None


class IccProcessingUpdate(BaseModel):
    status: IccStatus | None = None
    fixation_reagent: str | None = Field(default=None, max_length=200)
    fixation_duration_min: int | None = None
    fixation_datetime: datetime | None = None
    antibody_panel: str | None = Field(default=None, max_length=500)
    secondary_antibody: str | None = Field(default=None, max_length=500)
    microscope_settings: dict | None = None
    image_file_paths: dict | None = None
    analysis_software: str | None = Field(default=None, max_length=100)
    analysis_results: dict | None = None
    notes: str | None = None


class IccProcessingRead(BaseModel):
    id: uuid.UUID
    sample_id: uuid.UUID
    status: IccStatus
    fixation_reagent: str | None
    fixation_duration_min: int | None
    fixation_datetime: datetime | None
    antibody_panel: str | None
    secondary_antibody: str | None
    microscope_settings: dict | None
    image_file_paths: dict | None
    analysis_software: str
    analysis_results: dict | None
    operator_id: uuid.UUID | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    # Joined fields
    sample_code: str | None = None

    model_config = {"from_attributes": True}
