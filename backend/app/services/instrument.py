"""Instrument, plate, run, and omics result services."""

import io
import logging
import random
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AuditAction, OmicsResultType, QCStatus, RunStatus, RunType
from app.models.instrument import (
    Instrument,
    InstrumentRun,
    InstrumentRunSample,
    Plate,
    QCTemplate,
)
from app.models.omics import OmicsResult, OmicsResultSet
from app.models.participant import Participant
from app.models.sample import Sample
from app.models.user import AuditLog
from app.schemas.instrument import (
    InstrumentCreate,
    InstrumentRunCreate,
    InstrumentRunUpdate,
    InstrumentUpdate,
    PlateCreate,
    PlateRandomizeRequest,
    QCTemplateCreate,
    RunResultsUpload,
    WellAssignment,
)

logger = logging.getLogger(__name__)


def _escape_ilike(value: str) -> str:
    """Escape ILIKE metacharacters to prevent wildcard injection."""
    return (
        value
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )


# ══════════════════════════════════════════════════════════════════════
# Instrument Service
# ══════════════════════════════════════════════════════════════════════

INSTRUMENT_ALLOWED_SORTS = {"name", "instrument_type", "created_at", "updated_at"}


class InstrumentService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_instruments(
        self,
        page: int = 1,
        per_page: int = 20,
        search: str | None = None,
        instrument_type: str | None = None,
        is_active: bool | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> tuple[list[Instrument], int]:
        query = select(Instrument).where(Instrument.is_deleted == False)  # noqa: E712

        if search:
            safe = _escape_ilike(search)
            query = query.where(Instrument.name.ilike(f"%{safe}%"))
        if instrument_type:
            query = query.where(Instrument.instrument_type == instrument_type)
        if is_active is not None:
            query = query.where(Instrument.is_active == is_active)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        # Sort
        sort_col = sort if sort in INSTRUMENT_ALLOWED_SORTS else "created_at"
        col = getattr(Instrument, sort_col)
        query = query.order_by(col.desc() if order == "desc" else col.asc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_instrument(self, instrument_id: uuid.UUID) -> Instrument | None:
        result = await self.db.execute(
            select(Instrument).where(
                Instrument.id == instrument_id,
                Instrument.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def create_instrument(
        self, data: InstrumentCreate, created_by: uuid.UUID
    ) -> Instrument:
        instrument = Instrument(
            id=uuid.uuid4(),
            name=data.name,
            instrument_type=data.instrument_type,
            manufacturer=data.manufacturer,
            model=data.model,
            software=data.software,
            location=data.location,
            watch_directory=data.watch_directory,
            configuration=data.configuration,
            created_by=created_by,
        )
        self.db.add(instrument)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="instrument",
            entity_id=instrument.id,
            new_values={"name": instrument.name, "type": instrument.instrument_type.value},
        ))
        return instrument

    async def update_instrument(
        self,
        instrument_id: uuid.UUID,
        data: InstrumentUpdate,
        updated_by: uuid.UUID,
    ) -> Instrument | None:
        instrument = await self.get_instrument(instrument_id)
        if instrument is None:
            return None

        old_values = {}
        new_values = {}
        for field, value in data.model_dump(exclude_unset=True).items():
            current = getattr(instrument, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(instrument, field, value)
                new_values[field] = str(value) if value is not None else None

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="instrument",
                entity_id=instrument.id,
                old_values=old_values,
                new_values=new_values,
            ))
        return instrument


# ══════════════════════════════════════════════════════════════════════
# Plate Service
# ══════════════════════════════════════════════════════════════════════

PLATE_ALLOWED_SORTS = {"plate_name", "created_at"}


class PlateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_plates(
        self,
        page: int = 1,
        per_page: int = 20,
        run_id: uuid.UUID | None = None,
        search: str | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> tuple[list[Plate], int]:
        query = select(Plate).where(Plate.is_deleted == False)  # noqa: E712

        if run_id:
            query = query.where(Plate.run_id == run_id)
        if search:
            safe = _escape_ilike(search)
            query = query.where(Plate.plate_name.ilike(f"%{safe}%"))

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        sort_col = sort if sort in PLATE_ALLOWED_SORTS else "created_at"
        col = getattr(Plate, sort_col)
        query = query.order_by(col.desc() if order == "desc" else col.asc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_plate(self, plate_id: uuid.UUID) -> Plate | None:
        result = await self.db.execute(
            select(Plate).where(
                Plate.id == plate_id,
                Plate.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_plate_detail(self, plate_id: uuid.UUID) -> dict | None:
        """Get plate with all well assignments and sample codes."""
        plate = await self.get_plate(plate_id)
        if plate is None:
            return None

        # Fetch wells with sample codes
        well_result = await self.db.execute(
            select(InstrumentRunSample, Sample.sample_code)
            .outerjoin(Sample, InstrumentRunSample.sample_id == Sample.id)
            .where(InstrumentRunSample.plate_id == plate_id)
            .order_by(InstrumentRunSample.well_position.asc().nulls_last())
            .limit(10000)
        )
        wells = []
        for rs, sample_code in well_result.all():
            wells.append({
                "id": rs.id,
                "run_id": rs.run_id,
                "sample_id": rs.sample_id,
                "plate_id": rs.plate_id,
                "well_position": rs.well_position,
                "plate_number": rs.plate_number,
                "sample_order": rs.sample_order,
                "is_qc_sample": rs.is_qc_sample,
                "qc_type": rs.qc_type,
                "injection_volume_ul": rs.injection_volume_ul,
                "volume_withdrawn_ul": rs.volume_withdrawn_ul,
                "created_at": rs.created_at,
                "sample_code": sample_code,
            })

        return {
            "id": plate.id,
            "plate_name": plate.plate_name,
            "run_id": plate.run_id,
            "qc_template_id": plate.qc_template_id,
            "rows": plate.rows,
            "columns": plate.columns,
            "randomization_config": plate.randomization_config,
            "created_at": plate.created_at,
            "created_by": plate.created_by,
            "wells": wells,
        }

    async def create_plate(
        self, data: PlateCreate, created_by: uuid.UUID
    ) -> Plate:
        plate = Plate(
            id=uuid.uuid4(),
            plate_name=data.plate_name,
            run_id=data.run_id,
            qc_template_id=data.qc_template_id,
            rows=data.rows,
            columns=data.columns,
            randomization_config=data.randomization_config,
            created_by=created_by,
        )
        self.db.add(plate)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="plate",
            entity_id=plate.id,
            new_values={"plate_name": plate.plate_name, "rows": plate.rows, "columns": plate.columns},
        ))
        return plate

    async def assign_wells(
        self,
        plate_id: uuid.UUID,
        assignments: list[WellAssignment],
        assigned_by: uuid.UUID,
    ) -> list[InstrumentRunSample]:
        """Batch assign samples to wells on a plate with row-level locking."""
        # Lock the plate row to prevent concurrent well assignment
        result = await self.db.execute(
            select(Plate).where(Plate.id == plate_id).with_for_update()
        )
        plate = result.scalar_one_or_none()
        if plate is None:
            raise ValueError("Plate not found.")
        if plate.run_id is None:
            raise ValueError("Plate must be associated with a run before assigning wells.")

        # Check for duplicate well positions in the request
        requested_positions = [a.well_position for a in assignments]
        if len(requested_positions) != len(set(requested_positions)):
            raise ValueError("Duplicate well positions in assignment request.")

        # Check for already-occupied well positions on this plate
        existing_result = await self.db.execute(
            select(InstrumentRunSample.well_position)
            .where(
                InstrumentRunSample.plate_id == plate_id,
                InstrumentRunSample.well_position.in_(requested_positions),
            )
        )
        occupied = {row[0] for row in existing_result.all()}
        if occupied:
            raise ValueError(
                f"Well position(s) already occupied: {', '.join(sorted(occupied))}"
            )

        created = []
        for idx, assignment in enumerate(assignments):
            # Verify sample exists
            s_result = await self.db.execute(
                select(Sample).where(
                    Sample.id == assignment.sample_id,
                    Sample.is_deleted == False,  # noqa: E712
                )
            )
            sample = s_result.scalar_one_or_none()
            if sample is None:
                raise ValueError(f"Sample {assignment.sample_id} not found.")

            run_sample = InstrumentRunSample(
                id=uuid.uuid4(),
                run_id=plate.run_id,
                sample_id=assignment.sample_id,
                plate_id=plate_id,
                well_position=assignment.well_position,
                plate_number=1,
                sample_order=idx + 1,
                is_qc_sample=assignment.is_qc_sample,
                qc_type=assignment.qc_type,
                injection_volume_ul=assignment.injection_volume_ul,
                volume_withdrawn_ul=assignment.volume_withdrawn_ul,
            )
            self.db.add(run_sample)
            created.append(run_sample)

        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=assigned_by,
            action=AuditAction.UPDATE,
            entity_type="plate",
            entity_id=plate_id,
            new_values={
                "event": "assign_wells",
                "well_count": len(created),
            },
        ))
        return created

    async def randomize_plate(
        self,
        plate_id: uuid.UUID,
        data: PlateRandomizeRequest,
        randomized_by: uuid.UUID,
    ) -> list[InstrumentRunSample]:
        """Stratified randomization of samples onto a plate.

        Uses Fisher-Yates shuffle within strata to ensure balanced distribution
        of age_group, sex, and collection_site across the plate.
        QC wells are inserted per template if provided.
        """
        # Lock the plate
        result = await self.db.execute(
            select(Plate).where(Plate.id == plate_id).with_for_update()
        )
        plate = result.scalar_one_or_none()
        if plate is None:
            raise ValueError("Plate not found.")
        if plate.run_id is None:
            raise ValueError("Plate must be associated with a run before randomization.")

        # Build the well position list (e.g., A1, A2, ..., H12)
        total_wells = plate.rows * plate.columns
        well_positions = []
        for r in range(plate.rows):
            row_label = chr(ord("A") + r)
            for c in range(1, plate.columns + 1):
                well_positions.append(f"{row_label}{c}")

        # Determine QC well positions from template
        qc_wells: dict[str, str] = {}  # well_position -> qc_type
        if data.qc_template_id:
            tpl_result = await self.db.execute(
                select(QCTemplate).where(
                    QCTemplate.id == data.qc_template_id,
                    QCTemplate.is_active == True,  # noqa: E712
                )
            )
            tpl = tpl_result.scalar_one_or_none()
            if tpl and isinstance(tpl.template_data, dict):
                for key, qc_type in tpl.template_data.items():
                    if key in well_positions:
                        qc_wells[key] = str(qc_type)

        # Available positions = total minus QC positions
        available_positions = [p for p in well_positions if p not in qc_wells]

        if len(data.sample_ids) > len(available_positions):
            raise ValueError(
                f"Too many samples ({len(data.sample_ids)}) for available wells "
                f"({len(available_positions)} after {len(qc_wells)} QC wells)."
            )

        # Load samples with participant data for stratification
        s_result = await self.db.execute(
            select(Sample, Participant.age_group, Participant.sex, Participant.collection_site_id)
            .join(Participant, Sample.participant_id == Participant.id)
            .where(
                Sample.id.in_(data.sample_ids),
                Sample.is_deleted == False,  # noqa: E712
            )
        )
        sample_rows = s_result.all()
        if len(sample_rows) != len(data.sample_ids):
            found_ids = {row[0].id for row in sample_rows}
            missing = [str(sid) for sid in data.sample_ids if sid not in found_ids]
            raise ValueError(f"Samples not found: {', '.join(missing[:5])}")

        # Stratified shuffle
        if data.stratify_by:
            strata: dict[tuple, list] = defaultdict(list)
            for sample, age_group, sex, site_id in sample_rows:
                key_parts = []
                for var in data.stratify_by:
                    if var == "age_group":
                        key_parts.append(str(age_group.value) if age_group else "")
                    elif var == "sex":
                        key_parts.append(str(sex.value) if sex else "")
                    elif var == "collection_site":
                        key_parts.append(str(site_id) if site_id else "")
                strata[tuple(key_parts)].append(sample)

            # Shuffle within each stratum, then interleave
            ordered_samples = []
            for key in sorted(strata.keys()):
                group = strata[key]
                random.shuffle(group)
                ordered_samples.append(group)

            # Round-robin interleave from each stratum for balanced distribution
            shuffled_samples = []
            while any(ordered_samples):
                for group in ordered_samples:
                    if group:
                        shuffled_samples.append(group.pop(0))
                ordered_samples = [g for g in ordered_samples if g]
        else:
            shuffled_samples = [row[0] for row in sample_rows]
            random.shuffle(shuffled_samples)

        # Save randomization config on the plate
        plate.randomization_config = {
            "stratify_by": data.stratify_by,
            "qc_template_id": str(data.qc_template_id) if data.qc_template_id else None,
            "sample_count": len(shuffled_samples),
        }

        created: list[InstrumentRunSample] = []
        order_idx = 0

        # Insert QC wells first
        for pos, qc_type in qc_wells.items():
            # QC wells use a sentinel sample_id (the first sample's id as placeholder)
            # In practice these are flagged as is_qc_sample=True
            run_sample = InstrumentRunSample(
                id=uuid.uuid4(),
                run_id=plate.run_id,
                sample_id=shuffled_samples[0].id,  # placeholder for QC
                plate_id=plate_id,
                well_position=pos,
                plate_number=1,
                sample_order=order_idx,
                is_qc_sample=True,
                qc_type=qc_type,
                injection_volume_ul=data.injection_volume_ul,
            )
            self.db.add(run_sample)
            created.append(run_sample)
            order_idx += 1

        # Place samples in available positions
        for sample, pos in zip(shuffled_samples, available_positions):
            run_sample = InstrumentRunSample(
                id=uuid.uuid4(),
                run_id=plate.run_id,
                sample_id=sample.id,
                plate_id=plate_id,
                well_position=pos,
                plate_number=1,
                sample_order=order_idx,
                is_qc_sample=False,
                injection_volume_ul=data.injection_volume_ul,
            )
            self.db.add(run_sample)
            created.append(run_sample)
            order_idx += 1

        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=randomized_by,
            action=AuditAction.UPDATE,
            entity_type="plate",
            entity_id=plate_id,
            new_values={
                "event": "randomize",
                "sample_count": len(shuffled_samples),
                "qc_well_count": len(qc_wells),
                "stratify_by": data.stratify_by,
            },
        ))
        return created

    async def get_plate_grid(self, plate_id: uuid.UUID) -> dict | None:
        """Return a structured grid view of the plate layout."""
        plate = await self.get_plate(plate_id)
        if plate is None:
            return None

        # Build empty grid
        grid = []
        for r in range(plate.rows):
            row_label = chr(ord("A") + r)
            for c in range(1, plate.columns + 1):
                grid.append({
                    "well_position": f"{row_label}{c}",
                    "row_label": row_label,
                    "column_number": c,
                    "sample_id": None,
                    "sample_code": None,
                    "is_qc_sample": False,
                    "qc_type": None,
                })

        # Index grid by well_position for quick lookup
        grid_index = {cell["well_position"]: cell for cell in grid}

        # Fill from run_samples
        well_result = await self.db.execute(
            select(InstrumentRunSample, Sample.sample_code)
            .outerjoin(Sample, InstrumentRunSample.sample_id == Sample.id)
            .where(InstrumentRunSample.plate_id == plate_id)
            .limit(10000)
        )
        for rs, sample_code in well_result.all():
            if rs.well_position and rs.well_position in grid_index:
                cell = grid_index[rs.well_position]
                cell["sample_id"] = rs.sample_id
                cell["sample_code"] = sample_code
                cell["is_qc_sample"] = rs.is_qc_sample
                cell["qc_type"] = rs.qc_type

        return {
            "plate_id": plate.id,
            "plate_name": plate.plate_name,
            "rows": plate.rows,
            "columns": plate.columns,
            "grid": grid,
        }

    async def generate_tecan_worklist(
        self,
        plate_id: uuid.UUID,
        source_rack: str = "SrcRack",
        dest_rack: str = "DestPlate",
        default_volume_ul: Decimal = Decimal("5.00"),
    ) -> dict | None:
        """Generate a TECAN Freedom EVOware worklist CSV for a plate.

        Returns plate info and worklist rows. Each row maps:
        source rack ID, source position, dest rack ID, dest well, volume (uL).
        """
        plate = await self.get_plate(plate_id)
        if plate is None:
            return None

        # Fetch well assignments ordered by well_position
        well_result = await self.db.execute(
            select(InstrumentRunSample)
            .where(
                InstrumentRunSample.plate_id == plate_id,
                InstrumentRunSample.is_qc_sample == False,  # noqa: E712
            )
            .order_by(InstrumentRunSample.well_position.asc().nulls_last())
            .limit(10000)
        )
        run_samples = list(well_result.scalars().all())

        rows = []
        for idx, rs in enumerate(run_samples, start=1):
            volume = rs.injection_volume_ul if rs.injection_volume_ul else default_volume_ul
            rows.append({
                "source_rack": source_rack,
                "source_position": str(idx),
                "dest_rack": dest_rack,
                "dest_position": rs.well_position or str(idx),
                "volume_ul": volume,
            })

        return {
            "plate_id": plate.id,
            "plate_name": plate.plate_name,
            "row_count": len(rows),
            "rows": rows,
        }

    def generate_tecan_csv(self, worklist_data: dict) -> str:
        """Convert worklist data dict to CSV string in EVOware format."""
        output = io.StringIO()
        output.write("SourceRack,SourcePosition,DestRack,DestPosition,Volume_uL\n")
        for row in worklist_data.get("rows", []):
            output.write(
                f"{row['source_rack']},{row['source_position']},"
                f"{row['dest_rack']},{row['dest_position']},{row['volume_ul']}\n"
            )
        return output.getvalue()


# ══════════════════════════════════════════════════════════════════════
# QC Template Service
# ══════════════════════════════════════════════════════════════════════


class QCTemplateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_templates(
        self,
        page: int = 1,
        per_page: int = 20,
        run_type: str | None = None,
    ) -> tuple[list[QCTemplate], int]:
        query = select(QCTemplate).where(QCTemplate.is_active == True)  # noqa: E712

        if run_type:
            query = query.where(QCTemplate.run_type == run_type)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(QCTemplate.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_template(self, template_id: uuid.UUID) -> QCTemplate | None:
        result = await self.db.execute(
            select(QCTemplate).where(
                QCTemplate.id == template_id,
                QCTemplate.is_active == True,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def create_template(
        self, data: QCTemplateCreate, created_by: uuid.UUID
    ) -> QCTemplate:
        template = QCTemplate(
            id=uuid.uuid4(),
            name=data.name,
            description=data.description,
            template_data=data.template_data,
            run_type=data.run_type,
            created_by=created_by,
        )
        self.db.add(template)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="qc_template",
            entity_id=template.id,
            new_values={"name": template.name},
        ))
        return template


# ══════════════════════════════════════════════════════════════════════
# Run Service
# ══════════════════════════════════════════════════════════════════════

RUN_ALLOWED_SORTS = {"run_name", "status", "run_type", "created_at", "started_at", "completed_at"}

# Valid status transitions
_STATUS_TRANSITIONS: dict[RunStatus, set[RunStatus]] = {
    RunStatus.PLANNED: {RunStatus.IN_PROGRESS},
    RunStatus.IN_PROGRESS: {RunStatus.COMPLETED, RunStatus.FAILED},
    RunStatus.COMPLETED: set(),
    RunStatus.FAILED: {RunStatus.PLANNED},  # allow retry
}


class RunService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_runs(
        self,
        page: int = 1,
        per_page: int = 20,
        instrument_id: uuid.UUID | None = None,
        status: RunStatus | None = None,
        run_type: RunType | None = None,
        search: str | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> tuple[list[dict], int]:
        # Base filter for counting
        base_filter = select(InstrumentRun).where(
            InstrumentRun.is_deleted == False  # noqa: E712
        )
        if instrument_id:
            base_filter = base_filter.where(InstrumentRun.instrument_id == instrument_id)
        if status:
            base_filter = base_filter.where(InstrumentRun.status == status)
        if run_type:
            base_filter = base_filter.where(InstrumentRun.run_type == run_type)
        if search:
            safe = _escape_ilike(search)
            base_filter = base_filter.where(InstrumentRun.run_name.ilike(f"%{safe}%"))

        count_q = select(func.count()).select_from(base_filter.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        # Aggregated query: JOIN instrument name + COUNT plates and samples
        query = (
            select(
                InstrumentRun,
                Instrument.name.label("instrument_name"),
                func.count(distinct(Plate.id)).label("plate_count"),
                func.count(distinct(InstrumentRunSample.id)).label("sample_count"),
            )
            .outerjoin(Instrument, InstrumentRun.instrument_id == Instrument.id)
            .outerjoin(Plate, Plate.run_id == InstrumentRun.id)
            .outerjoin(InstrumentRunSample, InstrumentRunSample.run_id == InstrumentRun.id)
            .where(InstrumentRun.is_deleted == False)  # noqa: E712
        )
        if instrument_id:
            query = query.where(InstrumentRun.instrument_id == instrument_id)
        if status:
            query = query.where(InstrumentRun.status == status)
        if run_type:
            query = query.where(InstrumentRun.run_type == run_type)
        if search:
            safe = _escape_ilike(search)
            query = query.where(InstrumentRun.run_name.ilike(f"%{safe}%"))

        query = query.group_by(InstrumentRun.id, Instrument.name)

        sort_col = sort if sort in RUN_ALLOWED_SORTS else "created_at"
        col = getattr(InstrumentRun, sort_col)
        query = query.order_by(col.desc() if order == "desc" else col.asc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        items = []
        for run, instrument_name, plate_count, sample_count in result.all():
            items.append({
                "id": run.id,
                "instrument_id": run.instrument_id,
                "run_name": run.run_name,
                "run_type": run.run_type,
                "status": run.status,
                "started_at": run.started_at,
                "completed_at": run.completed_at,
                "operator_id": run.operator_id,
                "method_name": run.method_name,
                "batch_id": run.batch_id,
                "notes": run.notes,
                "raw_data_path": run.raw_data_path,
                "raw_data_size_bytes": run.raw_data_size_bytes,
                "raw_data_verified": run.raw_data_verified,
                "qc_status": run.qc_status,
                "created_by": run.created_by,
                "created_at": run.created_at,
                "updated_at": run.updated_at,
                "instrument_name": instrument_name,
                "plate_count": plate_count,
                "sample_count": sample_count,
            })
        return items, total

    async def get_run(self, run_id: uuid.UUID) -> dict | None:
        result = await self.db.execute(
            select(InstrumentRun).where(
                InstrumentRun.id == run_id,
                InstrumentRun.is_deleted == False,  # noqa: E712
            )
        )
        run = result.scalar_one_or_none()
        if run is None:
            return None
        return await self._run_dict(run)

    async def create_run(
        self, data: InstrumentRunCreate, created_by: uuid.UUID
    ) -> InstrumentRun:
        run = InstrumentRun(
            id=uuid.uuid4(),
            instrument_id=data.instrument_id,
            run_name=data.run_name,
            run_type=data.run_type,
            status=RunStatus.PLANNED,
            method_name=data.method_name,
            batch_id=data.batch_id,
            notes=data.notes,
            created_by=created_by,
        )
        self.db.add(run)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="instrument_run",
            entity_id=run.id,
            new_values={
                "run_name": run.run_name,
                "instrument_id": str(run.instrument_id),
                "status": run.status.value,
            },
        ))
        return run

    async def update_run(
        self,
        run_id: uuid.UUID,
        data: InstrumentRunUpdate,
        updated_by: uuid.UUID,
    ) -> InstrumentRun | None:
        result = await self.db.execute(
            select(InstrumentRun).where(
                InstrumentRun.id == run_id,
                InstrumentRun.is_deleted == False,  # noqa: E712
            )
        )
        run = result.scalar_one_or_none()
        if run is None:
            return None

        old_values = {}
        new_values = {}
        for field, value in data.model_dump(exclude_unset=True).items():
            current = getattr(run, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(run, field, value)
                new_values[field] = str(value) if value is not None else None

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="instrument_run",
                entity_id=run.id,
                old_values=old_values,
                new_values=new_values,
            ))
        return run

    async def start_run(
        self, run_id: uuid.UUID, operator_id: uuid.UUID
    ) -> InstrumentRun:
        """Transition run from PLANNED -> IN_PROGRESS."""
        result = await self.db.execute(
            select(InstrumentRun)
            .where(
                InstrumentRun.id == run_id,
                InstrumentRun.is_deleted == False,  # noqa: E712
            )
            .with_for_update()
        )
        run = result.scalar_one_or_none()
        if run is None:
            raise ValueError("Run not found.")

        if RunStatus.IN_PROGRESS not in _STATUS_TRANSITIONS.get(run.status, set()):
            raise ValueError(
                f"Cannot start run in status '{run.status.value}'. "
                f"Run must be in 'planned' status."
            )

        old_status = run.status.value
        run.status = RunStatus.IN_PROGRESS
        run.started_at = datetime.now(timezone.utc)
        run.operator_id = operator_id

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=operator_id,
            action=AuditAction.UPDATE,
            entity_type="instrument_run",
            entity_id=run.id,
            old_values={"status": old_status},
            new_values={"status": run.status.value, "started_at": str(run.started_at)},
        ))
        return run

    async def complete_run(
        self,
        run_id: uuid.UUID,
        completed_by: uuid.UUID,
        failed: bool = False,
    ) -> InstrumentRun:
        """Transition run from IN_PROGRESS -> COMPLETED or FAILED."""
        result = await self.db.execute(
            select(InstrumentRun)
            .where(
                InstrumentRun.id == run_id,
                InstrumentRun.is_deleted == False,  # noqa: E712
            )
            .with_for_update()
        )
        run = result.scalar_one_or_none()
        if run is None:
            raise ValueError("Run not found.")

        target_status = RunStatus.FAILED if failed else RunStatus.COMPLETED
        if target_status not in _STATUS_TRANSITIONS.get(run.status, set()):
            raise ValueError(
                f"Cannot transition run from '{run.status.value}' to '{target_status.value}'."
            )

        old_status = run.status.value
        run.status = target_status
        run.completed_at = datetime.now(timezone.utc)

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=completed_by,
            action=AuditAction.UPDATE,
            entity_type="instrument_run",
            entity_id=run.id,
            old_values={"status": old_status},
            new_values={"status": run.status.value, "completed_at": str(run.completed_at)},
        ))
        return run

    async def upload_results(
        self,
        run_id: uuid.UUID,
        data: RunResultsUpload,
        uploaded_by: uuid.UUID,
    ) -> OmicsResultSet:
        """Upload omics results for a run."""
        # Verify run exists
        result = await self.db.execute(
            select(InstrumentRun).where(
                InstrumentRun.id == run_id,
                InstrumentRun.is_deleted == False,  # noqa: E712
            )
        )
        run = result.scalar_one_or_none()
        if run is None:
            raise ValueError("Run not found.")

        now = datetime.now(timezone.utc)

        # Collect unique sample_ids and feature_ids
        sample_ids = {r.sample_id for r in data.results}
        feature_ids = {r.feature_id for r in data.results}

        result_set = OmicsResultSet(
            id=uuid.uuid4(),
            run_id=run_id,
            result_type=data.result_type,
            analysis_software=data.analysis_software,
            software_version=data.software_version,
            import_date=now,
            imported_by=uploaded_by,
            source_file_path=data.source_file_path,
            total_features=len(feature_ids),
            total_samples=len(sample_ids),
            notes=data.notes,
        )
        self.db.add(result_set)
        await self.db.flush()

        # Bulk insert individual results
        for item in data.results:
            self.db.add(OmicsResult(
                id=uuid.uuid4(),
                result_set_id=result_set.id,
                sample_id=item.sample_id,
                feature_id=item.feature_id,
                feature_name=item.feature_name,
                quantification_value=item.quantification_value,
                is_imputed=item.is_imputed,
                confidence_score=item.confidence_score,
            ))
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=uploaded_by,
            action=AuditAction.CREATE,
            entity_type="omics_result_set",
            entity_id=result_set.id,
            new_values={
                "run_id": str(run_id),
                "result_type": data.result_type.value,
                "total_features": result_set.total_features,
                "total_samples": result_set.total_samples,
                "result_count": len(data.results),
            },
        ))
        return result_set

    async def _run_dict(self, run: InstrumentRun) -> dict:
        """Enrich run with instrument_name, plate_count, sample_count."""
        # Instrument name
        inst_result = await self.db.execute(
            select(Instrument.name).where(Instrument.id == run.instrument_id)
        )
        instrument_name = inst_result.scalar_one_or_none()

        # Plate count
        plate_count_result = await self.db.execute(
            select(func.count()).where(Plate.run_id == run.id)
        )
        plate_count = plate_count_result.scalar_one()

        # Sample count
        sample_count_result = await self.db.execute(
            select(func.count()).where(InstrumentRunSample.run_id == run.id)
        )
        sample_count = sample_count_result.scalar_one()

        return {
            "id": run.id,
            "instrument_id": run.instrument_id,
            "run_name": run.run_name,
            "run_type": run.run_type,
            "status": run.status,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
            "operator_id": run.operator_id,
            "method_name": run.method_name,
            "batch_id": run.batch_id,
            "notes": run.notes,
            "raw_data_path": run.raw_data_path,
            "raw_data_size_bytes": run.raw_data_size_bytes,
            "raw_data_verified": run.raw_data_verified,
            "qc_status": run.qc_status,
            "created_by": run.created_by,
            "created_at": run.created_at,
            "updated_at": run.updated_at,
            "instrument_name": instrument_name,
            "plate_count": plate_count,
            "sample_count": sample_count,
        }


# ══════════════════════════════════════════════════════════════════════
# Omics Query Service
# ══════════════════════════════════════════════════════════════════════


class OmicsQueryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_result_sets(
        self,
        page: int = 1,
        per_page: int = 20,
        run_id: uuid.UUID | None = None,
        result_type: OmicsResultType | None = None,
    ) -> tuple[list[OmicsResultSet], int]:
        query = select(OmicsResultSet)

        if run_id:
            query = query.where(OmicsResultSet.run_id == run_id)
        if result_type:
            query = query.where(OmicsResultSet.result_type == result_type)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(OmicsResultSet.import_date.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_result_set(self, result_set_id: uuid.UUID) -> OmicsResultSet | None:
        result = await self.db.execute(
            select(OmicsResultSet).where(OmicsResultSet.id == result_set_id)
        )
        return result.scalar_one_or_none()

    async def query_results(
        self,
        page: int = 1,
        per_page: int = 100,
        result_set_id: uuid.UUID | None = None,
        sample_id: uuid.UUID | None = None,
        participant_id: uuid.UUID | None = None,
        feature_id: str | None = None,
    ) -> tuple[list[dict], int]:
        """Query omics results with optional filters."""
        query = (
            select(OmicsResult, Sample.sample_code)
            .join(Sample, OmicsResult.sample_id == Sample.id)
        )

        if result_set_id:
            query = query.where(OmicsResult.result_set_id == result_set_id)
        if sample_id:
            query = query.where(OmicsResult.sample_id == sample_id)
        if participant_id:
            query = query.where(Sample.participant_id == participant_id)
        if feature_id:
            safe = _escape_ilike(feature_id)
            query = query.where(OmicsResult.feature_id.ilike(f"%{safe}%"))

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(OmicsResult.feature_id.asc())
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        items = []
        for omics_r, sample_code in result.all():
            items.append({
                "id": omics_r.id,
                "result_set_id": omics_r.result_set_id,
                "sample_id": omics_r.sample_id,
                "feature_id": omics_r.feature_id,
                "feature_name": omics_r.feature_name,
                "quantification_value": omics_r.quantification_value,
                "is_imputed": omics_r.is_imputed,
                "confidence_score": omics_r.confidence_score,
                "created_at": omics_r.created_at,
                "sample_code": sample_code,
            })

        return items, total
