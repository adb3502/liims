"""Pydantic schemas for system settings."""

import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.enums import SettingValueType


class SystemSettingRead(BaseModel):
    id: uuid.UUID
    category: str
    key: str
    value: str
    value_type: SettingValueType
    description: str | None = None
    updated_at: datetime
    updated_by: uuid.UUID | None = None

    model_config = {"from_attributes": True}


class SystemSettingUpdate(BaseModel):
    value: str

    @field_validator("value")
    @classmethod
    def value_not_empty(cls, v: str) -> str:
        if not v and v != "":
            raise ValueError("Value is required.")
        return v


class SystemSettingGrouped(BaseModel):
    """Settings grouped by category for the GET /settings response."""
    category: str
    settings: list[SystemSettingRead]
