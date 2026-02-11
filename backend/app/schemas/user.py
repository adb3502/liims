"""User request/response schemas."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import UserRole
from app.schemas.auth import _validate_password_complexity


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=200)
    role: UserRole

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        return _validate_password_complexity(v)


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=200)
    role: UserRole | None = None
    is_active: bool | None = None


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    last_login: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    users: list[UserRead]
    meta: dict
