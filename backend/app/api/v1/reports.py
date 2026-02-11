"""Report generation, scheduled report CRUD, and preview endpoints."""

import math
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import ReportType, UserRole
from app.models.system import ScheduledReport
from app.models.user import User
from app.schemas.report import (
    ReportGenerateRequest,
    ScheduledReportCreate,
    ScheduledReportRead,
    ScheduledReportUpdate,
)
from app.services.report import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])

ADMIN_ROLES = (UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER)
REPORT_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.PI_RESEARCHER,
)
ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)


def _paginate_meta(page: int, per_page: int, total: int) -> dict:
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": math.ceil(total / per_page) if per_page else 0,
    }


# ── On-demand generation ──────────────────────────────────────────────


@router.post("/generate")
async def generate_report(
    data: ReportGenerateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*REPORT_ROLES))],
):
    """Generate an on-demand PDF report. Returns inline PDF."""
    svc = ReportService(db)
    pdf_bytes = await _generate_pdf(svc, data.report_type, data.filters)

    filename = f"{data.report_type.value}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


@router.get("/types", response_model=dict)
async def list_report_types(
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """List available report types."""
    types = [
        {
            "type": rt.value,
            "name": rt.value.replace("_", " ").title(),
            "description": _REPORT_DESCRIPTIONS.get(rt.value, ""),
        }
        for rt in ReportType
    ]
    return {"success": True, "data": types}


# ── Scheduled reports CRUD ────────────────────────────────────────────


@router.get("/scheduled", response_model=dict)
async def list_scheduled_reports(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    is_active: bool | None = None,
):
    """List scheduled reports."""
    query = select(ScheduledReport)
    if is_active is not None:
        query = query.where(ScheduledReport.is_active == is_active)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    query = query.order_by(ScheduledReport.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    items = list(result.scalars().all())

    return {
        "success": True,
        "data": [ScheduledReportRead.model_validate(r).model_dump(mode="json") for r in items],
        "meta": _paginate_meta(page, per_page, total),
    }


@router.post("/scheduled", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_scheduled_report(
    data: ScheduledReportCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Create a new scheduled report."""
    report = ScheduledReport(
        id=uuid.uuid4(),
        report_name=data.report_name,
        report_type=data.report_type,
        schedule_cron=data.schedule_cron,
        recipients=data.recipients,
        filters=data.filters,
        created_by=current_user.id,
    )
    db.add(report)
    await db.flush()
    return {
        "success": True,
        "data": ScheduledReportRead.model_validate(report).model_dump(mode="json"),
    }


@router.get("/scheduled/{report_id}", response_model=dict)
async def get_scheduled_report(
    report_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Get a scheduled report by ID."""
    result = await db.execute(
        select(ScheduledReport).where(ScheduledReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled report not found.")
    return {
        "success": True,
        "data": ScheduledReportRead.model_validate(report).model_dump(mode="json"),
    }


@router.put("/scheduled/{report_id}", response_model=dict)
async def update_scheduled_report(
    report_id: uuid.UUID,
    data: ScheduledReportUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Update a scheduled report."""
    result = await db.execute(
        select(ScheduledReport).where(ScheduledReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled report not found.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(report, field, value)

    await db.flush()
    return {
        "success": True,
        "data": ScheduledReportRead.model_validate(report).model_dump(mode="json"),
    }


@router.delete("/scheduled/{report_id}", response_model=dict)
async def delete_scheduled_report(
    report_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Delete a scheduled report."""
    result = await db.execute(
        select(ScheduledReport).where(ScheduledReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled report not found.")

    await db.delete(report)
    await db.flush()
    return {"success": True, "data": None}


@router.get("/scheduled/{report_id}/preview")
async def preview_scheduled_report(
    report_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    """Generate a preview PDF for a scheduled report without sending."""
    result = await db.execute(
        select(ScheduledReport).where(ScheduledReport.id == report_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled report not found.")

    svc = ReportService(db)
    pdf_bytes = await _generate_pdf(svc, report.report_type, report.filters)

    filename = f"preview_{report.report_type.value}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
        },
    )


# ── Helpers ───────────────────────────────────────────────────────────

async def _generate_pdf(
    svc: ReportService,
    report_type: ReportType,
    filters: dict | None,
) -> bytes:
    """Route to the correct service method based on report type."""
    try:
        if report_type == ReportType.ENROLLMENT_SUMMARY:
            return await svc.generate_enrollment_report(filters=filters)
        elif report_type == ReportType.INVENTORY_SUMMARY:
            return await svc.generate_inventory_report(filters=filters)
        elif report_type == ReportType.QUALITY_SUMMARY:
            return await svc.generate_quality_report(filters=filters)
        elif report_type == ReportType.COMPLIANCE:
            return await svc.generate_compliance_report(filters=filters)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown report type: {report_type}",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Report generation failed: {str(e)}",
        )


_REPORT_DESCRIPTIONS = {
    "enrollment_summary": "Participant enrollment demographics, site breakdown, and trends.",
    "inventory_summary": "Sample inventory by type and status, storage utilization, low-volume warnings.",
    "quality_summary": "QC pass/fail rates, deviation summary, ICC processing, omics coverage.",
    "compliance": "Consent coverage, audit trail summary, and DPDP compliance checklist.",
}
