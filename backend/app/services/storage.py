"""Storage management service: Freezer, Rack, Box, Position CRUD and assignment."""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import (
    AuditAction,
    FreezerEventType,
    FreezerType,
    NotificationSeverity,
    NotificationType,
    UserRole,
)
from app.models.sample import Sample
from app.models.storage import (
    Freezer,
    FreezerTemperatureEvent,
    StorageBox,
    StoragePosition,
    StorageRack,
)
from app.models.user import AuditLog
from app.schemas.storage import (
    BoxCreate,
    BoxUpdate,
    BulkAssignItem,
    FreezerCreate,
    FreezerUpdate,
    RackCreate,
    TempEventCreate,
    TempEventResolve,
)

CAPACITY_WARNING_THRESHOLD = 0.85

logger = logging.getLogger(__name__)


class StorageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Freezer CRUD ──────────────────────────────────────────────────

    async def list_freezers(
        self,
        page: int = 1,
        per_page: int = 20,
        freezer_type: FreezerType | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[dict], int]:
        """List freezers with utilization stats."""
        query = select(Freezer).where(Freezer.is_deleted == False)  # noqa: E712

        if freezer_type:
            query = query.where(Freezer.freezer_type == freezer_type)
        if is_active is not None:
            query = query.where(Freezer.is_active == is_active)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(Freezer.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        freezers = list(result.scalars().all())

        items = []
        for f in freezers:
            stats = await self._freezer_utilization(f.id)
            items.append({**self._freezer_dict(f), **stats})

        return items, total

    async def get_freezer(self, freezer_id: uuid.UUID) -> dict | None:
        result = await self.db.execute(
            select(Freezer).where(
                Freezer.id == freezer_id,
                Freezer.is_deleted == False,  # noqa: E712
            )
        )
        freezer = result.scalar_one_or_none()
        if freezer is None:
            return None

        stats = await self._freezer_utilization(freezer.id)
        return {**self._freezer_dict(freezer), **stats}

    async def create_freezer(
        self, data: FreezerCreate, created_by: uuid.UUID
    ) -> Freezer:
        freezer = Freezer(
            id=uuid.uuid4(),
            name=data.name,
            freezer_type=data.freezer_type,
            location=data.location,
            rack_count=data.rack_count,
            slots_per_rack=data.slots_per_rack,
            notes=data.notes,
            created_by=created_by,
        )
        self.db.add(freezer)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="freezer",
            entity_id=freezer.id,
            new_values={"name": freezer.name, "type": freezer.freezer_type.value},
        ))
        return freezer

    async def update_freezer(
        self,
        freezer_id: uuid.UUID,
        data: FreezerUpdate,
        updated_by: uuid.UUID,
    ) -> Freezer | None:
        result = await self.db.execute(
            select(Freezer).where(
                Freezer.id == freezer_id,
                Freezer.is_deleted == False,  # noqa: E712
            )
        )
        freezer = result.scalar_one_or_none()
        if freezer is None:
            return None

        old_values = {}
        new_values = {}
        for field, value in data.model_dump(exclude_unset=True).items():
            current = getattr(freezer, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(freezer, field, value)
                new_values[field] = str(value) if value is not None else None

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="freezer",
                entity_id=freezer.id,
                old_values=old_values,
                new_values=new_values,
            ))
        return freezer

    async def deactivate_freezer(
        self, freezer_id: uuid.UUID, deactivated_by: uuid.UUID
    ) -> Freezer | None:
        result = await self.db.execute(
            select(Freezer).where(
                Freezer.id == freezer_id,
                Freezer.is_deleted == False,  # noqa: E712
            )
        )
        freezer = result.scalar_one_or_none()
        if freezer is None:
            return None

        freezer.is_deleted = True
        freezer.deleted_at = datetime.now(timezone.utc)
        freezer.is_active = False

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=deactivated_by,
            action=AuditAction.DELETE,
            entity_type="freezer",
            entity_id=freezer.id,
            old_values={"is_active": "True"},
            new_values={"is_active": "False", "is_deleted": "True"},
        ))
        return freezer

    # ── Rack management ───────────────────────────────────────────────

    async def list_racks_for_freezer(self, freezer_id: uuid.UUID) -> list[StorageRack]:
        result = await self.db.execute(
            select(StorageRack).where(
                StorageRack.freezer_id == freezer_id,
                StorageRack.is_deleted == False,  # noqa: E712
            ).order_by(StorageRack.position_in_freezer.asc().nulls_last())
        )
        return list(result.scalars().all())

    async def create_rack(
        self,
        freezer_id: uuid.UUID,
        data: RackCreate,
        created_by: uuid.UUID,
    ) -> StorageRack:
        rack = StorageRack(
            id=uuid.uuid4(),
            freezer_id=freezer_id,
            rack_name=data.rack_name,
            position_in_freezer=data.position_in_freezer,
            capacity=data.capacity,
        )
        self.db.add(rack)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="storage_rack",
            entity_id=rack.id,
            new_values={"rack_name": rack.rack_name, "freezer_id": str(freezer_id)},
        ))
        return rack

    async def auto_create_racks(
        self,
        freezer_id: uuid.UUID,
        count: int,
        label_prefix: str,
        created_by: uuid.UUID,
    ) -> list[StorageRack]:
        """Batch-create N racks for a freezer."""
        racks = []
        for i in range(1, count + 1):
            rack = StorageRack(
                id=uuid.uuid4(),
                freezer_id=freezer_id,
                rack_name=f"{label_prefix}{i}",
                position_in_freezer=i,
            )
            self.db.add(rack)
            racks.append(rack)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="storage_rack",
            entity_id=racks[0].id if racks else None,
            new_values={"batch_count": count, "freezer_id": str(freezer_id)},
        ))
        return racks

    # ── Box CRUD ──────────────────────────────────────────────────────

    async def list_boxes(
        self,
        page: int = 1,
        per_page: int = 20,
        rack_id: uuid.UUID | None = None,
        group_code: str | None = None,
        has_space: bool | None = None,
    ) -> tuple[list[dict], int]:
        query = select(StorageBox).where(StorageBox.is_deleted == False)  # noqa: E712

        if rack_id:
            query = query.where(StorageBox.rack_id == rack_id)
        if group_code:
            query = query.where(StorageBox.group_code == group_code)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(StorageBox.created_at.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        boxes = list(result.scalars().all())

        items = []
        for box in boxes:
            occupied = await self._box_occupied_count(box.id)
            total_slots = box.rows * box.columns
            if has_space is True and occupied >= total_slots:
                continue
            if has_space is False and occupied < total_slots:
                continue
            items.append({
                **self._box_dict(box),
                "occupied_count": occupied,
                "total_slots": total_slots,
            })

        # Adjust total if has_space filter is applied (post-filter)
        if has_space is not None:
            total = len(items)

        return items, total

    async def get_box_detail(self, box_id: uuid.UUID) -> dict | None:
        """Get box with all positions and sample info."""
        result = await self.db.execute(
            select(StorageBox)
            .options(selectinload(StorageBox.positions))
            .where(
                StorageBox.id == box_id,
                StorageBox.is_deleted == False,  # noqa: E712
            )
        )
        box = result.scalar_one_or_none()
        if box is None:
            return None

        # Build position list with sample codes
        positions = []
        for pos in sorted(box.positions, key=lambda p: (p.row, p.column)):
            sample_code = None
            if pos.sample_id:
                s_result = await self.db.execute(
                    select(Sample.sample_code).where(Sample.id == pos.sample_id)
                )
                sample_code = s_result.scalar_one_or_none()

            positions.append({
                "id": pos.id,
                "box_id": pos.box_id,
                "row": pos.row,
                "column": pos.column,
                "sample_id": pos.sample_id,
                "occupied_at": pos.occupied_at,
                "locked_by": pos.locked_by,
                "locked_at": pos.locked_at,
                "sample_code": sample_code,
            })

        occupied = sum(1 for p in positions if p["sample_id"] is not None)
        return {
            **self._box_dict(box),
            "occupied_count": occupied,
            "total_slots": box.rows * box.columns,
            "positions": positions,
        }

    async def create_box(
        self, data: BoxCreate, created_by: uuid.UUID
    ) -> StorageBox:
        box = StorageBox(
            id=uuid.uuid4(),
            rack_id=data.rack_id,
            box_name=data.box_name,
            box_label=data.box_label,
            rows=data.rows,
            columns=data.columns,
            box_type=data.box_type,
            box_material=data.box_material,
            position_in_rack=data.position_in_rack,
            group_code=data.group_code,
            collection_site_id=data.collection_site_id,
            created_by=created_by,
        )
        self.db.add(box)
        await self.db.flush()

        # Auto-create position grid
        await self._auto_create_positions(box)

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="storage_box",
            entity_id=box.id,
            new_values={
                "box_name": box.box_name,
                "rows": box.rows,
                "columns": box.columns,
                "positions_created": box.rows * box.columns,
            },
        ))
        return box

    async def update_box(
        self,
        box_id: uuid.UUID,
        data: BoxUpdate,
        updated_by: uuid.UUID,
    ) -> StorageBox | None:
        result = await self.db.execute(
            select(StorageBox).where(
                StorageBox.id == box_id,
                StorageBox.is_deleted == False,  # noqa: E712
            )
        )
        box = result.scalar_one_or_none()
        if box is None:
            return None

        old_values = {}
        new_values = {}
        for field, value in data.model_dump(exclude_unset=True).items():
            current = getattr(box, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(box, field, value)
                new_values[field] = str(value) if value is not None else None

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="storage_box",
                entity_id=box.id,
                old_values=old_values,
                new_values=new_values,
            ))
        return box

    async def _auto_create_positions(self, box: StorageBox) -> None:
        """Create NxM position grid for a box."""
        for r in range(1, box.rows + 1):
            for c in range(1, box.columns + 1):
                self.db.add(StoragePosition(
                    id=uuid.uuid4(),
                    box_id=box.id,
                    row=r,
                    column=c,
                ))
        await self.db.flush()

    # ── Position operations ───────────────────────────────────────────

    async def assign_sample(
        self,
        position_id: uuid.UUID,
        sample_id: uuid.UUID,
        assigned_by: uuid.UUID,
    ) -> StoragePosition:
        """Assign a sample to a storage position with row-level locking."""
        # Lock the position row to prevent race conditions (SKIP LOCKED
        # lets concurrent requests skip already-locked rows instead of blocking)
        result = await self.db.execute(
            select(StoragePosition)
            .where(StoragePosition.id == position_id)
            .with_for_update(skip_locked=True)
        )
        position = result.scalar_one_or_none()
        if position is None:
            raise ValueError("Storage position not found.")
        if position.sample_id is not None:
            raise ValueError("Position is already occupied.")

        # Verify sample exists and is not already stored
        s_result = await self.db.execute(
            select(Sample).where(
                Sample.id == sample_id,
                Sample.is_deleted == False,  # noqa: E712
            )
        )
        sample = s_result.scalar_one_or_none()
        if sample is None:
            raise ValueError("Sample not found.")
        if sample.storage_location_id is not None:
            raise ValueError("Sample is already assigned to a storage position.")

        now = datetime.now(timezone.utc)
        position.sample_id = sample_id
        position.occupied_at = now
        position.locked_by = assigned_by
        position.locked_at = now

        # Update sample storage fields
        sample.storage_location_id = position.id
        sample.storage_datetime = now
        sample.stored_by = assigned_by

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=assigned_by,
            action=AuditAction.UPDATE,
            entity_type="storage_position",
            entity_id=position.id,
            new_values={
                "sample_id": str(sample_id),
                "event": "assign",
            },
        ))

        # Check freezer capacity and warn if above threshold
        await self._check_capacity_warning(position.box_id, assigned_by)

        return position

    async def unassign_sample(
        self,
        position_id: uuid.UUID,
        unassigned_by: uuid.UUID,
    ) -> StoragePosition:
        """Remove a sample from a storage position."""
        result = await self.db.execute(
            select(StoragePosition)
            .where(StoragePosition.id == position_id)
            .with_for_update(skip_locked=True)
        )
        position = result.scalar_one_or_none()
        if position is None:
            raise ValueError("Storage position not found.")
        if position.sample_id is None:
            raise ValueError("Position is not occupied.")

        old_sample_id = position.sample_id

        # Clear sample storage fields
        s_result = await self.db.execute(
            select(Sample).where(Sample.id == old_sample_id)
        )
        sample = s_result.scalar_one_or_none()
        if sample:
            sample.storage_location_id = None
            sample.storage_datetime = None
            sample.stored_by = None

        position.sample_id = None
        position.occupied_at = None
        position.locked_by = None
        position.locked_at = None

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=unassigned_by,
            action=AuditAction.UPDATE,
            entity_type="storage_position",
            entity_id=position.id,
            old_values={"sample_id": str(old_sample_id)},
            new_values={"sample_id": None, "event": "unassign"},
        ))
        return position

    async def find_available_position(self, box_id: uuid.UUID) -> StoragePosition | None:
        """Find the first empty position in a box (row-major order)."""
        result = await self.db.execute(
            select(StoragePosition)
            .where(
                StoragePosition.box_id == box_id,
                StoragePosition.sample_id == None,  # noqa: E711
            )
            .order_by(StoragePosition.row.asc(), StoragePosition.column.asc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def find_available_box(
        self, freezer_id: uuid.UUID, group_code: str | None = None
    ) -> StorageBox | None:
        """Find a box with available space, optionally matching group_code."""
        # Subquery: boxes in this freezer's racks
        rack_ids_q = select(StorageRack.id).where(
            StorageRack.freezer_id == freezer_id,
            StorageRack.is_deleted == False,  # noqa: E712
        )

        query = (
            select(StorageBox)
            .where(
                StorageBox.rack_id.in_(rack_ids_q),
                StorageBox.is_deleted == False,  # noqa: E712
            )
        )
        if group_code:
            query = query.where(StorageBox.group_code == group_code)

        query = query.order_by(StorageBox.created_at.asc())
        result = await self.db.execute(query)
        boxes = result.scalars().all()

        for box in boxes:
            total_slots = box.rows * box.columns
            occupied = await self._box_occupied_count(box.id)
            if occupied < total_slots:
                return box

        return None

    async def auto_assign_sample(
        self,
        sample_id: uuid.UUID,
        freezer_id: uuid.UUID,
        group_code: str | None,
        assigned_by: uuid.UUID,
    ) -> StoragePosition:
        """Auto-find an available box/position and assign the sample."""
        box = await self.find_available_box(freezer_id, group_code)
        if box is None:
            raise ValueError("No available box found in the specified freezer.")

        position = await self.find_available_position(box.id)
        if position is None:
            raise ValueError("No available position found.")

        return await self.assign_sample(position.id, sample_id, assigned_by)

    async def bulk_assign_positions(
        self,
        assignments: list[BulkAssignItem],
        assigned_by: uuid.UUID,
    ) -> list[StoragePosition]:
        """Batch-assign multiple samples to positions."""
        results = []
        for item in assignments:
            position = await self.assign_sample(
                item.position_id, item.sample_id, assigned_by,
            )
            results.append(position)
        return results

    async def consolidate_box(
        self,
        source_box_id: uuid.UUID,
        target_box_id: uuid.UUID,
        consolidated_by: uuid.UUID,
    ) -> dict:
        """Move all samples from source box to target box (-80 to -150 consolidation).

        Iterates occupied positions in source, finds available positions in target,
        and reassigns each sample.
        """
        # Validate source box
        source_result = await self.db.execute(
            select(StorageBox).where(
                StorageBox.id == source_box_id,
                StorageBox.is_deleted == False,  # noqa: E712
            )
        )
        source_box = source_result.scalar_one_or_none()
        if source_box is None:
            raise ValueError("Source box not found.")

        # Validate target box
        target_result = await self.db.execute(
            select(StorageBox).where(
                StorageBox.id == target_box_id,
                StorageBox.is_deleted == False,  # noqa: E712
            )
        )
        target_box = target_result.scalar_one_or_none()
        if target_box is None:
            raise ValueError("Target box not found.")

        # Get occupied positions from source
        src_positions = await self.db.execute(
            select(StoragePosition)
            .where(
                StoragePosition.box_id == source_box_id,
                StoragePosition.sample_id != None,  # noqa: E711
            )
            .order_by(StoragePosition.row.asc(), StoragePosition.column.asc())
        )
        occupied = list(src_positions.scalars().all())

        if not occupied:
            raise ValueError("Source box has no samples to consolidate.")

        # Check target has enough space
        target_occupied = await self._box_occupied_count(target_box_id)
        target_total = target_box.rows * target_box.columns
        available = target_total - target_occupied
        if available < len(occupied):
            raise ValueError(
                f"Target box has {available} available positions but "
                f"{len(occupied)} samples need to be moved."
            )

        moved_count = 0
        for src_pos in occupied:
            sample_id = src_pos.sample_id
            # Unassign from source
            await self.unassign_sample(src_pos.id, consolidated_by)
            # Find next available in target and assign
            target_pos = await self.find_available_position(target_box_id)
            if target_pos is None:
                raise ValueError("Ran out of target positions during consolidation.")
            await self.assign_sample(target_pos.id, sample_id, consolidated_by)
            moved_count += 1

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=consolidated_by,
            action=AuditAction.UPDATE,
            entity_type="storage_box",
            entity_id=source_box_id,
            new_values={
                "event": "consolidate",
                "source_box_id": str(source_box_id),
                "target_box_id": str(target_box_id),
                "moved_count": moved_count,
            },
        ))

        return {
            "source_box_id": source_box_id,
            "target_box_id": target_box_id,
            "moved_count": moved_count,
        }

    # ── Temperature events ────────────────────────────────────────────

    async def record_temperature_event(
        self,
        freezer_id: uuid.UUID,
        data: TempEventCreate,
        reported_by: uuid.UUID,
    ) -> FreezerTemperatureEvent:
        event = FreezerTemperatureEvent(
            id=uuid.uuid4(),
            freezer_id=freezer_id,
            event_type=data.event_type,
            event_start=data.event_start,
            event_end=data.event_end,
            observed_temp_c=data.observed_temp_c,
            reported_by=reported_by,
            samples_affected_count=data.samples_affected_count,
            resolution_notes=data.resolution_notes,
            requires_sample_review=data.requires_sample_review,
            created_by=reported_by,
        )
        self.db.add(event)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=reported_by,
            action=AuditAction.CREATE,
            entity_type="freezer_temperature_event",
            entity_id=event.id,
            new_values={
                "freezer_id": str(freezer_id),
                "event_type": data.event_type.value,
                "observed_temp_c": str(data.observed_temp_c) if data.observed_temp_c else None,
            },
        ))

        # Notify lab managers on excursion or failure events
        if data.event_type in (FreezerEventType.EXCURSION, FreezerEventType.FAILURE):
            await self._notify_temperature_event(freezer_id, event)

        return event

    async def list_temperature_events(
        self,
        freezer_id: uuid.UUID,
        page: int = 1,
        per_page: int = 20,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> tuple[list[FreezerTemperatureEvent], int]:
        query = select(FreezerTemperatureEvent).where(
            FreezerTemperatureEvent.freezer_id == freezer_id
        )
        if start_date:
            query = query.where(FreezerTemperatureEvent.event_start >= start_date)
        if end_date:
            query = query.where(FreezerTemperatureEvent.event_start <= end_date)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(FreezerTemperatureEvent.event_start.desc())
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_latest_temperature(
        self, freezer_id: uuid.UUID
    ) -> FreezerTemperatureEvent | None:
        result = await self.db.execute(
            select(FreezerTemperatureEvent)
            .where(FreezerTemperatureEvent.freezer_id == freezer_id)
            .order_by(FreezerTemperatureEvent.event_start.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def resolve_temperature_event(
        self,
        event_id: uuid.UUID,
        data: TempEventResolve,
        resolved_by: uuid.UUID,
    ) -> FreezerTemperatureEvent | None:
        """Add resolution notes and optionally close a temperature event."""
        result = await self.db.execute(
            select(FreezerTemperatureEvent).where(
                FreezerTemperatureEvent.id == event_id
            )
        )
        event = result.scalar_one_or_none()
        if event is None:
            return None

        old_values = {}
        new_values = {}

        if data.event_end is not None and event.event_end != data.event_end:
            old_values["event_end"] = str(event.event_end) if event.event_end else None
            event.event_end = data.event_end
            new_values["event_end"] = str(data.event_end)

        old_values["resolution_notes"] = event.resolution_notes
        event.resolution_notes = data.resolution_notes
        new_values["resolution_notes"] = data.resolution_notes

        if data.requires_sample_review is not None:
            old_values["requires_sample_review"] = str(event.requires_sample_review)
            event.requires_sample_review = data.requires_sample_review
            new_values["requires_sample_review"] = str(data.requires_sample_review)

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=resolved_by,
            action=AuditAction.UPDATE,
            entity_type="freezer_temperature_event",
            entity_id=event.id,
            old_values=old_values,
            new_values=new_values,
        ))
        return event

    # ── Search ────────────────────────────────────────────────────────

    async def search_storage(self, sample_code: str) -> list[dict]:
        """Find where a sample is stored: position -> box -> rack -> freezer."""
        result = await self.db.execute(
            select(
                Sample.id.label("sample_id"),
                Sample.sample_code,
                StoragePosition.id.label("position_id"),
                StoragePosition.row,
                StoragePosition.column,
                StorageBox.id.label("box_id"),
                StorageBox.box_name,
                StorageRack.id.label("rack_id"),
                StorageRack.rack_name,
                Freezer.id.label("freezer_id"),
                Freezer.name.label("freezer_name"),
            )
            .join(StoragePosition, Sample.storage_location_id == StoragePosition.id)
            .join(StorageBox, StoragePosition.box_id == StorageBox.id)
            .join(StorageRack, StorageBox.rack_id == StorageRack.id)
            .join(Freezer, StorageRack.freezer_id == Freezer.id)
            .where(
                Sample.sample_code.ilike(f"%{sample_code}%"),
                Sample.is_deleted == False,  # noqa: E712
            )
        )
        rows = result.all()
        return [
            {
                "sample_id": row.sample_id,
                "sample_code": row.sample_code,
                "position_id": row.position_id,
                "row": row.row,
                "column": row.column,
                "box_id": row.box_id,
                "box_name": row.box_name,
                "rack_id": row.rack_id,
                "rack_name": row.rack_name,
                "freezer_id": row.freezer_id,
                "freezer_name": row.freezer_name,
            }
            for row in rows
        ]

    # ── Private helpers ───────────────────────────────────────────────

    async def _freezer_utilization(self, freezer_id: uuid.UUID) -> dict:
        """Compute used_positions, total_positions, utilization_pct for a freezer."""
        # Total positions across all racks -> boxes -> positions
        rack_ids_q = select(StorageRack.id).where(
            StorageRack.freezer_id == freezer_id,
            StorageRack.is_deleted == False,  # noqa: E712
        )
        box_ids_q = select(StorageBox.id).where(
            StorageBox.rack_id.in_(rack_ids_q),
            StorageBox.is_deleted == False,  # noqa: E712
        )

        total_result = await self.db.execute(
            select(func.count(StoragePosition.id)).where(
                StoragePosition.box_id.in_(box_ids_q)
            )
        )
        total_positions = total_result.scalar_one()

        used_result = await self.db.execute(
            select(func.count(StoragePosition.id)).where(
                StoragePosition.box_id.in_(box_ids_q),
                StoragePosition.sample_id != None,  # noqa: E711
            )
        )
        used_positions = used_result.scalar_one()

        utilization_pct = (
            round(used_positions / total_positions * 100, 1)
            if total_positions > 0 else 0.0
        )

        return {
            "used_positions": used_positions,
            "total_positions": total_positions,
            "utilization_pct": utilization_pct,
        }

    async def _box_occupied_count(self, box_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count(StoragePosition.id)).where(
                StoragePosition.box_id == box_id,
                StoragePosition.sample_id != None,  # noqa: E711
            )
        )
        return result.scalar_one()

    def _freezer_dict(self, freezer: Freezer) -> dict:
        return {
            "id": freezer.id,
            "name": freezer.name,
            "freezer_type": freezer.freezer_type,
            "location": freezer.location,
            "total_capacity": freezer.total_capacity,
            "rack_count": freezer.rack_count,
            "slots_per_rack": freezer.slots_per_rack,
            "is_active": freezer.is_active,
            "notes": freezer.notes,
            "created_by": freezer.created_by,
            "created_at": freezer.created_at,
            "updated_at": freezer.updated_at,
        }

    def _box_dict(self, box: StorageBox) -> dict:
        return {
            "id": box.id,
            "rack_id": box.rack_id,
            "box_name": box.box_name,
            "box_label": box.box_label,
            "rows": box.rows,
            "columns": box.columns,
            "box_type": box.box_type,
            "box_material": box.box_material,
            "position_in_rack": box.position_in_rack,
            "group_code": box.group_code,
            "collection_site_id": box.collection_site_id,
            "created_by": box.created_by,
            "created_at": box.created_at,
            "updated_at": box.updated_at,
        }

    async def _check_capacity_warning(
        self, box_id: uuid.UUID, triggered_by: uuid.UUID
    ) -> None:
        """Check if the freezer containing this box has crossed the 85% threshold."""
        try:
            # Walk up: box -> rack -> freezer
            box_result = await self.db.execute(
                select(StorageBox.rack_id).where(StorageBox.id == box_id)
            )
            rack_id = box_result.scalar_one_or_none()
            if rack_id is None:
                return

            rack_result = await self.db.execute(
                select(StorageRack.freezer_id).where(StorageRack.id == rack_id)
            )
            freezer_id = rack_result.scalar_one_or_none()
            if freezer_id is None:
                return

            stats = await self._freezer_utilization(freezer_id)
            utilization = stats["utilization_pct"] / 100.0
            if utilization < CAPACITY_WARNING_THRESHOLD:
                return

            from app.services.notification import NotificationService
            notif_svc = NotificationService(self.db)

            f_result = await self.db.execute(
                select(Freezer.name).where(Freezer.id == freezer_id)
            )
            freezer_name = f_result.scalar_one_or_none() or "Unknown"

            pct = stats["utilization_pct"]
            await notif_svc.notify_role(
                role=UserRole.LAB_MANAGER,
                notification_type=NotificationType.FREEZER_CAPACITY_WARNING,
                severity=NotificationSeverity.WARNING,
                title=f"Freezer capacity warning: {freezer_name}",
                message=(
                    f"Freezer '{freezer_name}' is at {pct}% capacity "
                    f"({stats['used_positions']}/{stats['total_positions']} positions)."
                ),
                entity_type="freezer",
                entity_id=freezer_id,
            )
        except Exception:
            logger.exception("Failed to check capacity warning")

    async def _notify_temperature_event(
        self,
        freezer_id: uuid.UUID,
        event: FreezerTemperatureEvent,
    ) -> None:
        """Create notification for lab managers on critical temperature events."""
        try:
            from app.services.notification import NotificationService
            notif_svc = NotificationService(self.db)

            # Get freezer name for message
            f_result = await self.db.execute(
                select(Freezer.name).where(Freezer.id == freezer_id)
            )
            freezer_name = f_result.scalar_one_or_none() or "Unknown"

            severity = (
                NotificationSeverity.CRITICAL
                if event.event_type == FreezerEventType.FAILURE
                else NotificationSeverity.WARNING
            )
            temp_str = f" ({event.observed_temp_c}°C)" if event.observed_temp_c else ""

            await notif_svc.notify_role(
                role=UserRole.LAB_MANAGER,
                notification_type=NotificationType.FREEZER_TEMP_EVENT,
                severity=severity,
                title=f"Freezer {event.event_type.value}: {freezer_name}",
                message=(
                    f"Temperature event ({event.event_type.value}) recorded for "
                    f"freezer '{freezer_name}'{temp_str}."
                ),
                entity_type="freezer",
                entity_id=freezer_id,
                send_email=severity == NotificationSeverity.CRITICAL,
            )
        except Exception:
            logger.exception("Failed to create temperature event notification")
