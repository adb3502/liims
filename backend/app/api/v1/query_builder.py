"""Query builder endpoints for ad-hoc data exploration."""

import io
import math
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.core.rate_limit import RateLimiter
from app.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.query_builder import QueryExportRequest, QueryRequest
from app.services.query_builder import QueryBuilderService

router = APIRouter(prefix="/query-builder", tags=["query-builder"])

_query_rate_limit = RateLimiter(max_calls=20, window_seconds=60, key="query_builder", by="ip")

# Pre-build the static entity list for the /entities endpoint
_STATIC_ENTITY_LIST: list[dict] | None = None

# Operators grouped by simple type
_TYPE_OPERATORS: dict[str, list[str]] = {
    "string": ["eq", "ne", "contains", "starts_with", "is_null"],
    "number": ["eq", "ne", "gt", "gte", "lt", "lte", "is_null"],
    "date": ["eq", "gt", "lt", "gte", "lte", "between", "is_null"],
    "boolean": ["eq", "is_null"],
    "uuid": ["eq", "ne", "is_null"],
    "unknown": ["eq", "ne", "is_null"],
}


def _map_sa_type(raw_type: str) -> str:
    """Map SQLAlchemy type string to a simple frontend-friendly type name."""
    t = raw_type.upper()
    if any(s in t for s in ("VARCHAR", "TEXT", "CHAR", "STRING", "ENUM")):
        return "string"
    if any(s in t for s in ("INTEGER", "BIGINT", "SMALLINT", "NUMERIC", "FLOAT", "REAL", "DOUBLE", "DECIMAL")):
        return "number"
    if "BOOL" in t:
        return "boolean"
    if "DATE" in t or "TIMESTAMP" in t or "DATETIME" in t:
        return "date"
    if "UUID" in t:
        return "uuid"
    return "unknown"


def _col_label(col_name: str) -> str:
    """Convert snake_case column name to a human-readable label."""
    return col_name.replace("_", " ").title()


def _get_entity_list() -> list[dict]:
    global _STATIC_ENTITY_LIST
    if _STATIC_ENTITY_LIST is None:
        from app.services.query_builder import _ENTITY_REGISTRY
        entities = []
        for name, cfg in _ENTITY_REGISTRY.items():
            model = cfg["model"]
            fields = []
            for col_name in sorted(cfg["columns"]):
                col_attr = getattr(model, col_name, None)
                if col_attr is not None and hasattr(col_attr, "type"):
                    try:
                        raw_type = str(col_attr.type)
                    except Exception:
                        raw_type = "unknown"
                else:
                    raw_type = "unknown"
                simple_type = _map_sa_type(raw_type)
                fields.append({
                    "name": col_name,
                    "label": _col_label(col_name),
                    "type": simple_type,
                    "operators": _TYPE_OPERATORS.get(simple_type, _TYPE_OPERATORS["unknown"]),
                })
            entities.append({
                "entity": name,
                "fields": fields,
                "default_sort": cfg["default_sort"],
            })
        _STATIC_ENTITY_LIST = entities
    return _STATIC_ENTITY_LIST

QUERY_ROLES = (
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


@router.post("/execute", response_model=dict)
async def execute_query(
    data: QueryRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*QUERY_ROLES))],
    _rl: None = Depends(_query_rate_limit),
):
    """Execute a structured query against an entity."""
    svc = QueryBuilderService(db)

    try:
        rows, total, select_cols = await svc.execute_query(
            entity=data.entity,
            filters=[f.model_dump() for f in data.filters],
            columns=data.columns,
            sort_by=data.sort_by,
            sort_order=data.sort_order,
            page=data.page,
            per_page=data.per_page,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    pagination = _paginate_meta(data.page, data.per_page, total)
    return {
        "success": True,
        "data": {
            "columns": select_cols,
            "rows": rows,
            "total": total,
            "page": pagination["page"],
            "per_page": pagination["per_page"],
            "total_pages": pagination["total_pages"],
        },
    }


@router.get("/entities", response_model=dict)
async def list_entities(
    current_user: Annotated[User, Depends(require_role(*ALL_ROLES))],
):
    """List available entities and their queryable fields."""
    return {"success": True, "data": _get_entity_list()}


@router.post("/export")
async def export_query(
    data: QueryExportRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*QUERY_ROLES))],
    _rl: None = Depends(_query_rate_limit),
):
    """Export query results as CSV download."""
    svc = QueryBuilderService(db)

    try:
        csv_content = await svc.export_csv(
            entity=data.entity,
            filters=[f.model_dump() for f in data.filters],
            columns=data.columns,
            sort_by=data.sort_by,
            sort_order=data.sort_order,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not csv_content:
        return {"success": True, "data": [], "meta": {"total": 0}}

    filename = f"{data.entity}_export.csv"
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
