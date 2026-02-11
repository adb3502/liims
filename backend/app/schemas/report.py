"""Schemas for report generation and scheduled report endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import ReportType


# ── On-demand report generation ───────────────────────────────────────

class ReportGenerateRequest(BaseModel):
    report_type: ReportType
    filters: dict | None = None


# ── Scheduled reports CRUD ────────────────────────────────────────────

class ScheduledReportCreate(BaseModel):
    report_name: str = Field(min_length=1, max_length=200)
    report_type: ReportType
    schedule_cron: str = Field(
        min_length=1, max_length=50,
        description="Cron expression, e.g. '0 8 * * 1' for weekly Monday 8 AM",
    )
    recipients: list[str] = Field(
        min_length=1,
        description="List of email addresses",
    )
    filters: dict | None = None


class ScheduledReportUpdate(BaseModel):
    report_name: str | None = None
    schedule_cron: str | None = None
    recipients: list[str] | None = None
    filters: dict | None = None
    is_active: bool | None = None


class ScheduledReportRead(BaseModel):
    id: uuid.UUID
    report_name: str
    report_type: ReportType
    schedule_cron: str
    recipients: dict  # stored as JSONB, comes back as list
    filters: dict | None
    last_generated_at: datetime | None
    last_sent_at: datetime | None
    is_active: bool
    created_at: datetime
    created_by: uuid.UUID | None

    model_config = {"from_attributes": True}
