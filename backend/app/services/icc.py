"""ICC (Immunocytochemistry) workflow service."""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AuditAction, IccStatus
from app.models.omics import IccProcessing
from app.models.sample import Sample
from app.models.user import AuditLog
from app.schemas.instrument import IccProcessingCreate, IccProcessingUpdate

logger = logging.getLogger(__name__)


def _escape_ilike(value: str) -> str:
    return (
        value
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


ICC_ALLOWED_SORTS = {"status", "created_at", "updated_at"}

# Valid ICC status transitions (linear workflow, allow rollback one step)
_ICC_STATUS_ORDER = list(IccStatus)
_ICC_TRANSITIONS: dict[IccStatus, set[IccStatus]] = {}
for i, s in enumerate(_ICC_STATUS_ORDER):
    allowed = set()
    if i + 1 < len(_ICC_STATUS_ORDER):
        allowed.add(_ICC_STATUS_ORDER[i + 1])
    _ICC_TRANSITIONS[s] = allowed


class IccService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_icc(
        self,
        page: int = 1,
        per_page: int = 20,
        sample_id: uuid.UUID | None = None,
        participant_id: uuid.UUID | None = None,
        status: IccStatus | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> tuple[list[dict], int]:
        query = (
            select(IccProcessing, Sample.sample_code)
            .join(Sample, IccProcessing.sample_id == Sample.id)
        )

        if sample_id:
            query = query.where(IccProcessing.sample_id == sample_id)
        if participant_id:
            query = query.where(Sample.participant_id == participant_id)
        if status:
            query = query.where(IccProcessing.status == status)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        sort_col = sort if sort in ICC_ALLOWED_SORTS else "created_at"
        col = getattr(IccProcessing, sort_col)
        query = query.order_by(col.desc() if order == "desc" else col.asc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        items = []
        for icc, sample_code in result.all():
            items.append({**self._icc_dict(icc), "sample_code": sample_code})

        return items, total

    async def get_icc(self, icc_id: uuid.UUID) -> dict | None:
        result = await self.db.execute(
            select(IccProcessing, Sample.sample_code)
            .join(Sample, IccProcessing.sample_id == Sample.id)
            .where(IccProcessing.id == icc_id)
        )
        row = result.one_or_none()
        if row is None:
            return None
        icc, sample_code = row
        return {**self._icc_dict(icc), "sample_code": sample_code}

    async def create_icc(
        self, data: IccProcessingCreate, created_by: uuid.UUID
    ) -> IccProcessing:
        # Verify sample exists
        s_result = await self.db.execute(
            select(Sample).where(
                Sample.id == data.sample_id,
                Sample.is_deleted == False,  # noqa: E712
            )
        )
        sample = s_result.scalar_one_or_none()
        if sample is None:
            raise ValueError("Sample not found.")

        icc = IccProcessing(
            id=uuid.uuid4(),
            sample_id=data.sample_id,
            status=data.status,
            fixation_reagent=data.fixation_reagent,
            fixation_duration_min=data.fixation_duration_min,
            antibody_panel=data.antibody_panel,
            secondary_antibody=data.secondary_antibody,
            notes=data.notes,
            operator_id=created_by,
        )
        self.db.add(icc)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="icc_processing",
            entity_id=icc.id,
            new_values={
                "sample_id": str(data.sample_id),
                "status": icc.status.value,
            },
        ))
        return icc

    async def update_icc(
        self,
        icc_id: uuid.UUID,
        data: IccProcessingUpdate,
        updated_by: uuid.UUID,
    ) -> IccProcessing | None:
        result = await self.db.execute(
            select(IccProcessing).where(IccProcessing.id == icc_id)
        )
        icc = result.scalar_one_or_none()
        if icc is None:
            return None

        old_values = {}
        new_values = {}

        update_data = data.model_dump(exclude_unset=True)

        # Validate status transition if status is being changed
        if "status" in update_data and update_data["status"] is not None:
            new_status = update_data["status"]
            if new_status != icc.status:
                allowed = _ICC_TRANSITIONS.get(icc.status, set())
                if new_status not in allowed:
                    raise ValueError(
                        f"Cannot transition ICC from '{icc.status.value}' to '{new_status.value}'. "
                        f"Expected next status: {', '.join(s.value for s in allowed) if allowed else 'none (terminal)'}."
                    )

        for field, value in update_data.items():
            current = getattr(icc, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(icc, field, value)
                new_values[field] = str(value) if value is not None else None

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="icc_processing",
                entity_id=icc.id,
                old_values=old_values,
                new_values=new_values,
            ))
        return icc

    async def advance_status(
        self,
        icc_id: uuid.UUID,
        advanced_by: uuid.UUID,
    ) -> IccProcessing:
        """Advance ICC processing to the next status in the workflow."""
        result = await self.db.execute(
            select(IccProcessing)
            .where(IccProcessing.id == icc_id)
            .with_for_update()
        )
        icc = result.scalar_one_or_none()
        if icc is None:
            raise ValueError("ICC processing record not found.")

        allowed = _ICC_TRANSITIONS.get(icc.status, set())
        if not allowed:
            raise ValueError(
                f"ICC processing is already at terminal status '{icc.status.value}'."
            )

        old_status = icc.status.value
        # Take the next status (there is exactly one forward transition)
        new_status = next(iter(allowed))
        icc.status = new_status

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=advanced_by,
            action=AuditAction.UPDATE,
            entity_type="icc_processing",
            entity_id=icc.id,
            old_values={"status": old_status},
            new_values={"status": new_status.value, "event": "advance_status"},
        ))
        return icc

    def _icc_dict(self, icc: IccProcessing) -> dict:
        return {
            "id": icc.id,
            "sample_id": icc.sample_id,
            "status": icc.status,
            "fixation_reagent": icc.fixation_reagent,
            "fixation_duration_min": icc.fixation_duration_min,
            "fixation_datetime": icc.fixation_datetime,
            "antibody_panel": icc.antibody_panel,
            "secondary_antibody": icc.secondary_antibody,
            "microscope_settings": icc.microscope_settings,
            "image_file_paths": icc.image_file_paths,
            "analysis_software": icc.analysis_software,
            "analysis_results": icc.analysis_results,
            "operator_id": icc.operator_id,
            "notes": icc.notes,
            "created_at": icc.created_at,
            "updated_at": icc.updated_at,
        }
