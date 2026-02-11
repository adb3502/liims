"""Pydantic schemas for offline sync endpoints."""

from datetime import datetime

from pydantic import BaseModel, Field


class SyncMutation(BaseModel):
    id: str = Field(description="Client-generated unique ID for this mutation")
    type: str = Field(description="Mutation type (e.g., participant_checkin, sample_register)")
    entity_id: str | None = Field(default=None, description="ID of the entity being mutated")
    timestamp: str = Field(description="ISO timestamp when mutation was created on client")
    payload: dict = Field(default_factory=dict, description="Mutation-specific data")


class SyncPushRequest(BaseModel):
    device_id: str | None = Field(default=None, max_length=100)
    mutations: list[SyncMutation] = Field(default_factory=list, max_length=100)


class SyncPullRequest(BaseModel):
    since: datetime | None = Field(
        default=None,
        description="Only return data updated after this timestamp",
    )
    entity_types: list[str] | None = Field(
        default=None,
        description="Entity types to pull (e.g., participants, samples)",
    )


class SyncConflictResponse(BaseModel):
    entity_type: str
    entity_id: str
    field: str
    client_value: str | None = None
    server_value: str | None = None
    resolved_value: str | None = None


class SyncPushResponse(BaseModel):
    total: int
    applied: int
    skipped: int
    conflicts: list[dict] = Field(default_factory=list)
    errors: list[dict] = Field(default_factory=list)
