"""Dynamic query builder service with safe SQLAlchemy construction."""

import csv
import io
import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.field_ops import FieldEvent
from app.models.instrument import InstrumentRun
from app.models.participant import Participant
from app.models.partner import PartnerLabResult
from app.models.sample import Sample

logger = logging.getLogger(__name__)


def _escape_ilike(value: str) -> str:
    """Escape ILIKE metacharacters to prevent wildcard injection."""
    return (
        value
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


# ── Entity registry ──────────────────────────────────────────────────

# Maps entity names to (model_class, allowed_columns, default_sort).
# Only columns in the allowlist can be queried, filtered, or sorted on.

_ENTITY_REGISTRY: dict[str, dict] = {
    "participants": {
        "model": Participant,
        "columns": {
            "id", "participant_code", "group_code", "age_group", "sex",
            "wave", "enrollment_date", "enrollment_source", "completion_pct",
            "collection_site_id", "created_at", "updated_at",
        },
        "default_sort": "created_at",
        "soft_delete": True,
    },
    "samples": {
        "model": Sample,
        "columns": {
            "id", "sample_code", "participant_id", "sample_type", "status",
            "wave", "collection_datetime", "storage_datetime", "has_deviation",
            "initial_volume_ul", "remaining_volume_ul", "collection_site_id",
            "created_at", "updated_at",
        },
        "default_sort": "created_at",
        "soft_delete": True,
    },
    "field_events": {
        "model": FieldEvent,
        "columns": {
            "id", "event_name", "event_date", "event_type", "status",
            "expected_participants", "actual_participants", "wave",
            "collection_site_id", "partner_lab", "created_at", "updated_at",
        },
        "default_sort": "event_date",
        "soft_delete": True,
    },
    "instrument_runs": {
        "model": InstrumentRun,
        "columns": {
            "id", "instrument_id", "run_name", "run_type", "status",
            "started_at", "completed_at", "method_name", "batch_id",
            "qc_status", "created_at", "updated_at",
        },
        "default_sort": "created_at",
        "soft_delete": True,
    },
    "partner_results": {
        "model": PartnerLabResult,
        "columns": {
            "id", "import_id", "participant_id", "participant_code_raw",
            "test_date", "test_name_raw", "canonical_test_id",
            "test_value", "test_unit", "is_abnormal", "match_status",
            "created_at",
        },
        "default_sort": "created_at",
        "soft_delete": False,
    },
}

ALLOWED_OPERATORS = {
    "eq", "ne", "gt", "lt", "gte", "lte", "like", "in", "is_null",
}


class QueryBuilderService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def list_entities(self) -> list[dict]:
        """Return the list of queryable entities and their fields."""
        entities = []
        for name, cfg in _ENTITY_REGISTRY.items():
            model = cfg["model"]
            fields = []
            for col_name in sorted(cfg["columns"]):
                col_attr = getattr(model, col_name, None)
                if col_attr is not None and hasattr(col_attr, "type"):
                    try:
                        col_type = str(col_attr.type)
                    except Exception:
                        col_type = "unknown"
                else:
                    col_type = "unknown"
                fields.append({"name": col_name, "type": col_type})
            entities.append({
                "entity": name,
                "fields": fields,
                "default_sort": cfg["default_sort"],
            })
        return entities

    async def execute_query(
        self,
        entity: str,
        filters: list[dict] | None = None,
        columns: list[str] | None = None,
        sort_by: str | None = None,
        sort_order: str = "desc",
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[list[dict], int]:
        """Build and execute a dynamic query safely.

        Returns (rows_as_dicts, total_count).
        """
        cfg = _ENTITY_REGISTRY.get(entity)
        if cfg is None:
            raise ValueError(f"Unknown entity: {entity}")

        model = cfg["model"]
        allowed_cols = cfg["columns"]

        # Determine selected columns (validated against allowlist)
        if columns:
            select_cols = [c for c in columns if c in allowed_cols]
            if not select_cols:
                raise ValueError("No valid columns selected.")
        else:
            select_cols = sorted(allowed_cols)

        # Build column references safely using getattr
        col_refs = []
        for col_name in select_cols:
            col_ref = getattr(model, col_name, None)
            if col_ref is None:
                continue
            col_refs.append(col_ref)

        if not col_refs:
            raise ValueError("No valid columns to select.")

        query = select(*col_refs)

        # Apply soft-delete filter
        if cfg.get("soft_delete"):
            query = query.where(model.is_deleted == False)  # noqa: E712

        # Apply filters
        if filters:
            for f in filters:
                field_name = f.get("field")
                operator = f.get("operator")
                value = f.get("value")

                if field_name not in allowed_cols:
                    raise ValueError(f"Invalid filter field: {field_name}")
                if operator not in ALLOWED_OPERATORS:
                    raise ValueError(f"Invalid operator: {operator}")

                col = getattr(model, field_name)
                query = self._apply_filter(query, col, operator, value)

        # Count total before pagination
        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        # Sort (validated against allowlist)
        sort_col_name = sort_by if sort_by and sort_by in allowed_cols else cfg["default_sort"]
        sort_col = getattr(model, sort_col_name)
        if sort_order == "asc":
            query = query.order_by(sort_col.asc())
        else:
            query = query.order_by(sort_col.desc())

        # Paginate
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        rows = result.all()

        # Convert to list of dicts
        data = []
        for row in rows:
            row_dict = {}
            for idx, col_name in enumerate(select_cols):
                val = row[idx]
                # Serialize non-JSON-native types
                if isinstance(val, uuid.UUID):
                    val = str(val)
                elif isinstance(val, datetime):
                    val = val.isoformat()
                elif hasattr(val, "value"):
                    val = val.value
                row_dict[col_name] = val
            data.append(row_dict)

        return data, total

    async def export_csv(
        self,
        entity: str,
        filters: list[dict] | None = None,
        columns: list[str] | None = None,
        sort_by: str | None = None,
        sort_order: str = "desc",
    ) -> str:
        """Execute query and return CSV string (max 50000 rows)."""
        data, _ = await self.execute_query(
            entity=entity,
            filters=filters,
            columns=columns,
            sort_by=sort_by,
            sort_order=sort_order,
            page=1,
            per_page=50000,
        )

        if not data:
            return ""

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=list(data[0].keys()))
        writer.writeheader()
        writer.writerows(data)
        return output.getvalue()

    def _apply_filter(self, query, col, operator: str, value):
        """Apply a single filter operator to a query."""
        if operator == "eq":
            return query.where(col == value)
        elif operator == "ne":
            return query.where(col != value)
        elif operator == "gt":
            return query.where(col > value)
        elif operator == "lt":
            return query.where(col < value)
        elif operator == "gte":
            return query.where(col >= value)
        elif operator == "lte":
            return query.where(col <= value)
        elif operator == "like":
            safe = _escape_ilike(str(value))
            return query.where(col.ilike(f"%{safe}%"))
        elif operator == "in":
            if not isinstance(value, list):
                raise ValueError("'in' operator requires a list value.")
            return query.where(col.in_(value))
        elif operator == "is_null":
            if value is True or value == "true":
                return query.where(col.is_(None))
            else:
                return query.where(col.isnot(None))
        else:
            raise ValueError(f"Unsupported operator: {operator}")
