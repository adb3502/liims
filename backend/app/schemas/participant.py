"""Participant and collection site request/response schemas."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.enums import AgeGroup, ConsentType, EnrollmentSource, Sex


# --- Collection Site ---

class CollectionSiteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=20)
    participant_range_start: int = Field(ge=1)
    participant_range_end: int = Field(ge=1)
    city: str = "Bangalore"
    address: str | None = None


class CollectionSiteUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    participant_range_start: int | None = Field(None, ge=1)
    participant_range_end: int | None = Field(None, ge=1)
    city: str | None = None
    address: str | None = None
    is_active: bool | None = None


class CollectionSiteRead(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    participant_range_start: int
    participant_range_end: int
    city: str | None
    address: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Participant ---

class ParticipantCreate(BaseModel):
    participant_code: str = Field(min_length=1, max_length=20)
    group_code: str = Field(min_length=1, max_length=5)
    participant_number: int = Field(ge=1)
    age_group: AgeGroup
    sex: Sex
    date_of_birth: date | None = None
    collection_site_id: uuid.UUID
    enrollment_date: datetime
    enrollment_source: EnrollmentSource = EnrollmentSource.MANUAL
    odk_submission_id: str | None = None
    wave: int = 1


class ParticipantUpdate(BaseModel):
    age_group: AgeGroup | None = None
    sex: Sex | None = None
    date_of_birth: date | None = None
    collection_site_id: uuid.UUID | None = None
    odk_submission_id: str | None = None


class ParticipantRead(BaseModel):
    id: uuid.UUID
    participant_code: str
    group_code: str
    participant_number: int
    age_group: AgeGroup
    sex: Sex
    date_of_birth: date | None
    collection_site_id: uuid.UUID
    enrollment_date: datetime
    enrollment_source: EnrollmentSource
    wave: int
    completion_pct: Decimal
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ParticipantDetail(ParticipantRead):
    """Extended participant with consents and sample counts."""
    consents: list["ConsentRead"] = []
    sample_counts: dict = {}  # {"plasma": 3, "epigenetics": 4, ...}
    collection_site: CollectionSiteRead | None = None


# --- Consent ---

class ConsentCreate(BaseModel):
    consent_type: ConsentType
    consent_given: bool
    consent_date: date
    is_proxy: bool = False
    witness_name: str | None = None
    form_version: str | None = None


class ConsentUpdate(BaseModel):
    consent_given: bool | None = None
    consent_date: date | None = None
    witness_name: str | None = None
    withdrawal_date: date | None = None
    withdrawal_reason: str | None = None


class ConsentRead(BaseModel):
    id: uuid.UUID
    participant_id: uuid.UUID
    consent_type: ConsentType
    consent_given: bool
    consent_date: date
    is_proxy: bool
    witness_name: str | None
    form_version: str | None
    withdrawal_date: date | None
    withdrawal_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
