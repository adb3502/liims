"""QR code request/response schemas."""

import uuid

from pydantic import BaseModel, Field

from app.models.enums import SampleStatus


class QrBatchRequest(BaseModel):
    sample_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=200)


class QrStorageInfo(BaseModel):
    freezer_name: str | None = None
    rack_name: str | None = None
    box_name: str | None = None
    row: int | None = None
    column: int | None = None


class QrLookupResponse(BaseModel):
    sample_id: uuid.UUID
    sample_code: str
    status: SampleStatus
    sample_type: str
    participant_code: str | None = None
    collection_site: str | None = None
    wave: int
    storage: QrStorageInfo | None = None
