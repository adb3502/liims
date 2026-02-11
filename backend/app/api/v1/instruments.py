"""Instrument, plate, run, and omics result endpoints."""

import io
import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import (
    InstrumentType,
    OmicsResultType,
    RunStatus,
    RunType,
    UserRole,
)
from app.models.user import User
from app.schemas.instrument import (
    InstrumentCreate,
    InstrumentRead,
    InstrumentRunCreate,
    InstrumentRunRead,
    InstrumentRunUpdate,
    InstrumentUpdate,
    OmicsResultRead,
    OmicsResultSetRead,
    PlateCreate,
    PlateDetail,
    PlateGridResponse,
    PlateRandomizeRequest,
    PlateRead,
    QCTemplateCreate,
    QCTemplateRead,
    RunResultsUpload,
    RunSampleRead,
    TecanWorklistResponse,
    WellAssignRequest,
)
from app.services.instrument import (
    InstrumentService,
    OmicsQueryService,
    PlateService,
    QCTemplateService,
    RunService,
)

router = APIRouter(prefix="/instruments", tags=["instruments"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)
WRITE_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
)
ADMIN_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER,
)


def _paginate_meta(page: int, per_page: int, total: int) -> dict:
    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": math.ceil(total / per_page) if per_page else 0,
    }


# ── QC / Plate Templates (static paths before /{instrument_id}) ──────

@router.get("/plate-templates", response_model=dict)
async def list_qc_templates(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    run_type: RunType | None = None,
):
    svc = QCTemplateService(db)
    items, total = await svc.list_templates(
        page=page, per_page=per_page, run_type=run_type,
    )
    return {
        "success": True,
        "data": [QCTemplateRead.model_validate(t).model_dump(mode="json") for t in items],
        "meta": _paginate_meta(page, per_page, total),
    }


@router.post("/plate-templates", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_qc_template(
    data: QCTemplateCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = QCTemplateService(db)
    template = await svc.create_template(data, created_by=current_user.id)
    return {
        "success": True,
        "data": QCTemplateRead.model_validate(template).model_dump(mode="json"),
    }


# ── Plates (static paths before /{instrument_id}) ────────────────────

@router.get("/plates", response_model=dict)
async def list_plates(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    run_id: uuid.UUID | None = None,
    search: str | None = None,
    sort: str = "created_at",
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    svc = PlateService(db)
    items, total = await svc.list_plates(
        page=page, per_page=per_page, run_id=run_id,
        search=search, sort=sort, order=order,
    )
    return {
        "success": True,
        "data": [PlateRead.model_validate(p).model_dump(mode="json") for p in items],
        "meta": _paginate_meta(page, per_page, total),
    }


@router.post("/plates", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_plate(
    data: PlateCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = PlateService(db)
    plate = await svc.create_plate(data, created_by=current_user.id)
    return {
        "success": True,
        "data": PlateRead.model_validate(plate).model_dump(mode="json"),
    }


@router.get("/plates/{plate_id}", response_model=dict)
async def get_plate_detail(
    plate_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = PlateService(db)
    detail = await svc.get_plate_detail(plate_id)
    if detail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plate not found.")
    return {
        "success": True,
        "data": PlateDetail(**detail).model_dump(mode="json"),
    }


@router.post("/plates/{plate_id}/assign-wells", response_model=dict)
async def assign_wells(
    plate_id: uuid.UUID,
    data: WellAssignRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = PlateService(db)
    try:
        created = await svc.assign_wells(
            plate_id, data.assignments, assigned_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": [RunSampleRead.model_validate(rs).model_dump(mode="json") for rs in created],
        "meta": {"count": len(created)},
    }


@router.post("/plates/{plate_id}/randomize", response_model=dict)
async def randomize_plate(
    plate_id: uuid.UUID,
    data: PlateRandomizeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    """Stratified randomization of samples onto a plate with optional QC template."""
    svc = PlateService(db)
    try:
        created = await svc.randomize_plate(
            plate_id, data, randomized_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": [RunSampleRead.model_validate(rs).model_dump(mode="json") for rs in created],
        "meta": {"count": len(created)},
    }


@router.get("/plates/{plate_id}/grid", response_model=dict)
async def get_plate_grid(
    plate_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Get plate layout as a structured grid for visual display."""
    svc = PlateService(db)
    grid_data = await svc.get_plate_grid(plate_id)
    if grid_data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plate not found.")
    return {
        "success": True,
        "data": PlateGridResponse(**grid_data).model_dump(mode="json"),
    }


@router.get("/plates/{plate_id}/tecan-worklist")
async def get_tecan_worklist(
    plate_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
    format: str = Query("json", pattern="^(json|csv)$"),
):
    """Generate TECAN Freedom EVOware worklist for a plate.

    Use format=csv to download as CSV file for direct import into EVOware.
    """
    svc = PlateService(db)
    worklist_data = await svc.generate_tecan_worklist(plate_id)
    if worklist_data is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plate not found.")

    if format == "csv":
        csv_content = svc.generate_tecan_csv(worklist_data)
        return StreamingResponse(
            io.StringIO(csv_content),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="worklist_{plate_id}.csv"',
            },
        )

    return {
        "success": True,
        "data": TecanWorklistResponse(**worklist_data).model_dump(mode="json"),
    }


# ── Instrument Runs (static paths before /{instrument_id}) ───────────

@router.get("/runs", response_model=dict)
async def list_runs(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    instrument_id: uuid.UUID | None = None,
    status_filter: RunStatus | None = Query(None, alias="status"),
    run_type: RunType | None = None,
    search: str | None = None,
    sort: str = "created_at",
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    svc = RunService(db)
    items, total = await svc.list_runs(
        page=page, per_page=per_page,
        instrument_id=instrument_id, status=status_filter,
        run_type=run_type, search=search,
        sort=sort, order=order,
    )
    return {
        "success": True,
        "data": [InstrumentRunRead(**item).model_dump(mode="json") for item in items],
        "meta": _paginate_meta(page, per_page, total),
    }


@router.post("/runs", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_run(
    data: InstrumentRunCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = RunService(db)
    run = await svc.create_run(data, created_by=current_user.id)
    detail = await svc.get_run(run.id)
    return {
        "success": True,
        "data": InstrumentRunRead(**detail).model_dump(mode="json"),
    }


@router.get("/runs/{run_id}", response_model=dict)
async def get_run(
    run_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = RunService(db)
    detail = await svc.get_run(run_id)
    if detail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found.")
    return {
        "success": True,
        "data": InstrumentRunRead(**detail).model_dump(mode="json"),
    }


@router.put("/runs/{run_id}", response_model=dict)
async def update_run(
    run_id: uuid.UUID,
    data: InstrumentRunUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = RunService(db)
    run = await svc.update_run(run_id, data, updated_by=current_user.id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found.")
    detail = await svc.get_run(run.id)
    return {
        "success": True,
        "data": InstrumentRunRead(**detail).model_dump(mode="json"),
    }


@router.post("/runs/{run_id}/start", response_model=dict)
async def start_run(
    run_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = RunService(db)
    try:
        run = await svc.start_run(run_id, operator_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    detail = await svc.get_run(run.id)
    return {
        "success": True,
        "data": InstrumentRunRead(**detail).model_dump(mode="json"),
    }


@router.post("/runs/{run_id}/complete", response_model=dict)
async def complete_run(
    run_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
    failed: bool = Query(False),
):
    svc = RunService(db)
    try:
        run = await svc.complete_run(run_id, completed_by=current_user.id, failed=failed)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    detail = await svc.get_run(run.id)
    return {
        "success": True,
        "data": InstrumentRunRead(**detail).model_dump(mode="json"),
    }


@router.post("/runs/{run_id}/results", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_run_results(
    run_id: uuid.UUID,
    data: RunResultsUpload,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*WRITE_ROLES))],
):
    svc = RunService(db)
    try:
        result_set = await svc.upload_results(run_id, data, uploaded_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": OmicsResultSetRead.model_validate(result_set).model_dump(mode="json"),
    }


# ── Omics Results (static paths before /{instrument_id}) ─────────────

@router.get("/omics-results", response_model=dict)
async def query_omics_results(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=1000),
    result_set_id: uuid.UUID | None = None,
    sample_id: uuid.UUID | None = None,
    participant_id: uuid.UUID | None = None,
    feature_id: str | None = None,
):
    svc = OmicsQueryService(db)
    items, total = await svc.query_results(
        page=page, per_page=per_page,
        result_set_id=result_set_id, sample_id=sample_id,
        participant_id=participant_id, feature_id=feature_id,
    )
    return {
        "success": True,
        "data": [OmicsResultRead(**item).model_dump(mode="json") for item in items],
        "meta": _paginate_meta(page, per_page, total),
    }


@router.get("/omics-result-sets", response_model=dict)
async def list_omics_result_sets(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    run_id: uuid.UUID | None = None,
    result_type: OmicsResultType | None = None,
):
    svc = OmicsQueryService(db)
    items, total = await svc.list_result_sets(
        page=page, per_page=per_page,
        run_id=run_id, result_type=result_type,
    )
    return {
        "success": True,
        "data": [OmicsResultSetRead.model_validate(rs).model_dump(mode="json") for rs in items],
        "meta": _paginate_meta(page, per_page, total),
    }


@router.get("/omics-result-sets/{result_set_id}", response_model=dict)
async def get_omics_result_set(
    result_set_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = OmicsQueryService(db)
    result_set = await svc.get_result_set(result_set_id)
    if result_set is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Result set not found.")
    return {
        "success": True,
        "data": OmicsResultSetRead.model_validate(result_set).model_dump(mode="json"),
    }


# ── Instruments (parameterized paths last) ────────────────────────────

@router.get("", response_model=dict)
async def list_instruments(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    instrument_type: InstrumentType | None = None,
    is_active: bool | None = None,
    sort: str = "created_at",
    order: str = Query("desc", pattern="^(asc|desc)$"),
):
    svc = InstrumentService(db)
    items, total = await svc.list_instruments(
        page=page, per_page=per_page, search=search,
        instrument_type=instrument_type, is_active=is_active,
        sort=sort, order=order,
    )
    return {
        "success": True,
        "data": [InstrumentRead.model_validate(i).model_dump(mode="json") for i in items],
        "meta": _paginate_meta(page, per_page, total),
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_instrument(
    data: InstrumentCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    svc = InstrumentService(db)
    instrument = await svc.create_instrument(data, created_by=current_user.id)
    return {
        "success": True,
        "data": InstrumentRead.model_validate(instrument).model_dump(mode="json"),
    }


@router.get("/{instrument_id}", response_model=dict)
async def get_instrument(
    instrument_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    svc = InstrumentService(db)
    instrument = await svc.get_instrument(instrument_id)
    if instrument is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Instrument not found.")
    return {
        "success": True,
        "data": InstrumentRead.model_validate(instrument).model_dump(mode="json"),
    }


@router.put("/{instrument_id}", response_model=dict)
async def update_instrument(
    instrument_id: uuid.UUID,
    data: InstrumentUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
):
    svc = InstrumentService(db)
    instrument = await svc.update_instrument(instrument_id, data, updated_by=current_user.id)
    if instrument is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Instrument not found.")
    return {
        "success": True,
        "data": InstrumentRead.model_validate(instrument).model_dump(mode="json"),
    }
