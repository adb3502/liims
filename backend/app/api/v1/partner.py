"""Routes for ODK integration, partner lab imports, canonical tests, stool kits."""

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.database import get_db
from app.models.enums import PartnerName, StoolKitStatus, UserRole
from app.models.user import User
from app.schemas.partner import (
    CanonicalTestCreate,
    CanonicalTestRead,
    CanonicalTestUpdate,
    ImportConfigureRequest,
    ImportExecuteResponse,
    ImportPreviewResponse,
    OdkFormConfigCreate,
    OdkFormConfigRead,
    OdkFormConfigUpdate,
    OdkSubmissionRead,
    OdkSyncLogRead,
    OdkSyncTriggerRequest,
    PartnerLabImportRead,
    PartnerLabResultRead,
    StoolKitCreate,
    StoolKitRead,
    StoolKitUpdate,
    TestNameAliasCreate,
    TestNameAliasRead,
)
from app.services.partner import (
    CanonicalTestService,
    OdkService,
    PartnerImportService,
    StoolKitService,
)

router = APIRouter(prefix="/partner", tags=["partner"])

ALL_ROLES = (
    UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.LAB_TECHNICIAN,
    UserRole.FIELD_COORDINATOR, UserRole.DATA_ENTRY,
    UserRole.COLLABORATOR, UserRole.PI_RESEARCHER,
)
ADMIN_LAB = (UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER)
FIELD_OPS = (UserRole.SUPER_ADMIN, UserRole.LAB_MANAGER, UserRole.FIELD_COORDINATOR)


# ---------------------------------------------------------------------------
# ODK Form Configs
# ---------------------------------------------------------------------------


@router.get("/odk/form-configs", response_model=dict)
async def list_form_configs(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """List all ODK form configurations."""
    svc = OdkService(db)
    configs = await svc.list_form_configs()
    return {
        "success": True,
        "data": [OdkFormConfigRead.model_validate(c).model_dump(mode="json") for c in configs],
    }


@router.post("/odk/form-configs", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_form_config(
    data: OdkFormConfigCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Create an ODK form configuration mapping."""
    svc = OdkService(db)
    config = await svc.create_form_config(data, created_by=current_user.id)
    return {
        "success": True,
        "data": OdkFormConfigRead.model_validate(config).model_dump(mode="json"),
    }


@router.put("/odk/form-configs/{config_id}", response_model=dict)
async def update_form_config(
    config_id: uuid.UUID,
    data: OdkFormConfigUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Update an ODK form configuration."""
    svc = OdkService(db)
    config = await svc.update_form_config(config_id, data, updated_by=current_user.id)
    if config is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Form config not found.")
    return {
        "success": True,
        "data": OdkFormConfigRead.model_validate(config).model_dump(mode="json"),
    }


# ---------------------------------------------------------------------------
# ODK Sync
# ---------------------------------------------------------------------------


@router.post("/odk/sync", response_model=dict, status_code=status.HTTP_201_CREATED)
async def trigger_sync(
    data: OdkSyncTriggerRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Trigger an ODK sync (specific form or all forms)."""
    svc = OdkService(db)
    log = await svc.trigger_sync(form_id=data.form_id, triggered_by=current_user.id)
    return {
        "success": True,
        "data": OdkSyncLogRead.model_validate(log).model_dump(mode="json"),
    }


@router.get("/odk/sync-logs", response_model=dict)
async def list_sync_logs(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List ODK sync logs with pagination."""
    svc = OdkService(db)
    logs, total = await svc.list_sync_logs(page=page, per_page=per_page)
    return {
        "success": True,
        "data": [OdkSyncLogRead.model_validate(l).model_dump(mode="json") for l in logs],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.get("/odk/submissions", response_model=dict)
async def list_submissions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    form_id: str | None = None,
    processing_status: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List ODK submissions with filters and pagination."""
    svc = OdkService(db)
    submissions, total = await svc.list_submissions(
        form_id=form_id, status=processing_status, page=page, per_page=per_page,
    )
    return {
        "success": True,
        "data": [OdkSubmissionRead.model_validate(s).model_dump(mode="json") for s in submissions],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


# ---------------------------------------------------------------------------
# Partner Lab Imports
# ---------------------------------------------------------------------------


@router.post("/imports/upload", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_csv(
    file: UploadFile,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
    partner_name: PartnerName = Query(...),
):
    """Upload a partner lab CSV file for import."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only CSV files are accepted.")

    MAX_CSV_SIZE = 10 * 1024 * 1024  # 10 MB
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty.")
    if len(content) > MAX_CSV_SIZE:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "CSV file exceeds 10 MB limit.")

    svc = PartnerImportService(db)
    record = await svc.upload_csv(
        file_content=content,
        file_name=file.filename,
        partner_name=partner_name,
        uploaded_by=current_user.id,
    )
    return {
        "success": True,
        "data": PartnerLabImportRead.model_validate(record).model_dump(mode="json"),
    }


@router.get("/imports/{import_id}/preview", response_model=dict)
async def preview_import(
    import_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Preview an import with auto-matching validation."""
    svc = PartnerImportService(db)
    try:
        preview = await svc.preview_import(import_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
    return {
        "success": True,
        "data": preview.model_dump(mode="json"),
    }


@router.post("/imports/{import_id}/configure", response_model=dict)
async def configure_import(
    import_id: uuid.UUID,
    data: ImportConfigureRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Set field and test name mapping configuration for an import."""
    svc = PartnerImportService(db)
    record = await svc.configure_import(import_id, data, configured_by=current_user.id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found.")
    return {
        "success": True,
        "data": PartnerLabImportRead.model_validate(record).model_dump(mode="json"),
    }


@router.post("/imports/{import_id}/execute", response_model=dict)
async def execute_import(
    import_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Execute import: create PartnerLabResult records from CSV."""
    svc = PartnerImportService(db)
    try:
        record, total, matched, failed = await svc.execute_import(
            import_id, executed_by=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    return {
        "success": True,
        "data": ImportExecuteResponse(
            import_id=record.id,
            records_total=total,
            records_matched=matched,
            records_failed=failed,
        ).model_dump(mode="json"),
    }


@router.get("/imports", response_model=dict)
async def list_imports(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    partner_name: PartnerName | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List partner lab imports with pagination."""
    svc = PartnerImportService(db)
    imports, total = await svc.list_imports(
        partner_name=partner_name, page=page, per_page=per_page,
    )
    return {
        "success": True,
        "data": [PartnerLabImportRead.model_validate(i).model_dump(mode="json") for i in imports],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.get("/imports/{import_id}", response_model=dict)
async def get_import_detail(
    import_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """Get import detail with results."""
    svc = PartnerImportService(db)
    record = await svc.get_import_detail(import_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found.")

    data = PartnerLabImportRead.model_validate(record).model_dump(mode="json")
    data["results"] = [
        PartnerLabResultRead.model_validate(r).model_dump(mode="json")
        for r in record.results
    ]
    return {"success": True, "data": data}


@router.get("/partner-results", response_model=dict)
async def list_partner_results(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    participant_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Query all partner lab results, optionally filtered by participant."""
    svc = PartnerImportService(db)
    results, total = await svc.list_partner_results(
        participant_id=participant_id, page=page, per_page=per_page,
    )
    return {
        "success": True,
        "data": [PartnerLabResultRead.model_validate(r).model_dump(mode="json") for r in results],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


# ---------------------------------------------------------------------------
# Canonical Tests
# ---------------------------------------------------------------------------


@router.get("/canonical-tests", response_model=dict)
async def list_canonical_tests(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    category: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """List canonical tests with optional category filter and search."""
    svc = CanonicalTestService(db)
    tests, total = await svc.list_tests(
        category=category, search=search, page=page, per_page=per_page,
    )
    data = []
    for t in tests:
        item = CanonicalTestRead.model_validate(t)
        item.aliases_count = len(t.aliases) if t.aliases else 0
        data.append(item.model_dump(mode="json"))
    return {
        "success": True,
        "data": data,
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }


@router.post("/canonical-tests", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_canonical_test(
    data: CanonicalTestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Create a canonical test definition."""
    svc = CanonicalTestService(db)
    test = await svc.create_test(data, created_by=current_user.id)
    return {
        "success": True,
        "data": CanonicalTestRead.model_validate(test).model_dump(mode="json"),
    }


@router.put("/canonical-tests/{test_id}", response_model=dict)
async def update_canonical_test(
    test_id: uuid.UUID,
    data: CanonicalTestUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Update a canonical test definition."""
    svc = CanonicalTestService(db)
    test = await svc.update_test(test_id, data, updated_by=current_user.id)
    if test is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Canonical test not found.")
    return {
        "success": True,
        "data": CanonicalTestRead.model_validate(test).model_dump(mode="json"),
    }


@router.get("/canonical-tests/{test_id}/aliases", response_model=dict)
async def list_aliases(
    test_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """List aliases for a canonical test."""
    svc = CanonicalTestService(db)
    aliases = await svc.list_aliases(test_id)
    return {
        "success": True,
        "data": [TestNameAliasRead.model_validate(a).model_dump(mode="json") for a in aliases],
    }


@router.post("/canonical-tests/{test_id}/aliases", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_alias(
    test_id: uuid.UUID,
    data: TestNameAliasCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Add a partner test name alias to a canonical test."""
    svc = CanonicalTestService(db)
    alias = await svc.add_alias(test_id, data, created_by=current_user.id)
    return {
        "success": True,
        "data": TestNameAliasRead.model_validate(alias).model_dump(mode="json"),
    }


@router.delete("/canonical-tests/aliases/{alias_id}", response_model=dict)
async def delete_alias(
    alias_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_LAB))],
):
    """Delete a test name alias."""
    svc = CanonicalTestService(db)
    deleted = await svc.delete_alias(alias_id, deleted_by=current_user.id)
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alias not found.")
    return {"success": True, "data": None}


# ---------------------------------------------------------------------------
# Stool Kits
# ---------------------------------------------------------------------------


@router.post("/stool-kits", response_model=dict, status_code=status.HTTP_201_CREATED)
async def issue_kit(
    data: StoolKitCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*FIELD_OPS))],
):
    """Issue a stool kit to a participant."""
    svc = StoolKitService(db)
    kit = await svc.issue_kit(data, issued_by=current_user.id)
    return {
        "success": True,
        "data": StoolKitRead.model_validate(kit).model_dump(mode="json"),
    }


@router.put("/stool-kits/{kit_id}", response_model=dict)
async def update_kit(
    kit_id: uuid.UUID,
    data: StoolKitUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*FIELD_OPS))],
):
    """Update stool kit status."""
    svc = StoolKitService(db)
    kit = await svc.update_kit(kit_id, data, updated_by=current_user.id)
    if kit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stool kit not found.")
    return {
        "success": True,
        "data": StoolKitRead.model_validate(kit).model_dump(mode="json"),
    }


@router.get("/stool-kits", response_model=dict)
async def list_kits(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
    participant_id: uuid.UUID | None = None,
    kit_status: StoolKitStatus | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List stool kits with optional filters."""
    svc = StoolKitService(db)
    kits, total = await svc.list_kits(
        participant_id=participant_id, status=kit_status,
        page=page, per_page=per_page,
    )
    return {
        "success": True,
        "data": [StoolKitRead.model_validate(k).model_dump(mode="json") for k in kits],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": math.ceil(total / per_page) if per_page else 0,
        },
    }
