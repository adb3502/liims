"""Schemas for label generation requests."""

from pydantic import BaseModel, Field


class LabelGenerateRequest(BaseModel):
    """Request to generate labels for a set of participants."""

    participant_codes: list[str] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="List of participant codes (e.g. ['1A-001', '2B-045'])",
    )
    date_str: str = Field(
        default="",
        description="Optional date string appended to filenames",
    )


class SingleGroupLabelRequest(BaseModel):
    """Request to generate a single label group document."""

    participant_codes: list[str] = Field(
        ...,
        min_length=1,
        max_length=500,
    )
    group: str = Field(
        ...,
        pattern=r"^(cryovial|epigenetics|samples|edta|sst_fl_blood|urine)$",
        description="Label group: cryovial, epigenetics, samples, edta, sst_fl_blood, or urine",
    )
