"""Field event service: CRUD, participant management, check-in, bulk digitization."""

import logging
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import AuditAction, FieldEventStatus
from app.models.field_ops import FieldEvent, FieldEventParticipant
from app.models.participant import Participant
from app.models.user import AuditLog
from app.schemas.field_ops import (
    BulkDigitizeItem,
    CheckInRequest,
    FieldEventCreate,
    FieldEventUpdate,
)

logger = logging.getLogger(__name__)

# Valid status transitions for field events
VALID_STATUS_TRANSITIONS: dict[FieldEventStatus, set[FieldEventStatus]] = {
    FieldEventStatus.PLANNED: {FieldEventStatus.IN_PROGRESS, FieldEventStatus.CANCELLED},
    FieldEventStatus.IN_PROGRESS: {FieldEventStatus.COMPLETED, FieldEventStatus.CANCELLED},
    FieldEventStatus.COMPLETED: set(),
    FieldEventStatus.CANCELLED: set(),
}


class FieldEventService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- CRUD ---

    async def create_event(
        self,
        data: FieldEventCreate,
        created_by: uuid.UUID,
    ) -> FieldEvent:
        """Create a new field event with status PLANNED."""
        event = FieldEvent(
            id=uuid.uuid4(),
            event_name=data.event_name,
            event_date=data.event_date,
            collection_site_id=data.collection_site_id,
            event_type=data.event_type,
            expected_participants=data.expected_participants,
            actual_participants=0,
            status=FieldEventStatus.PLANNED,
            coordinator_id=data.coordinator_id,
            partner_lab=data.partner_lab,
            notes=data.notes,
            wave=data.wave,
            created_by=created_by,
        )
        self.db.add(event)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="field_event",
            entity_id=event.id,
            new_values={
                "event_name": event.event_name,
                "event_date": str(event.event_date),
                "event_type": event.event_type.value,
            },
        ))
        return event

    async def get_event(self, event_id: uuid.UUID) -> FieldEvent | None:
        """Get a single field event with its participants eagerly loaded."""
        result = await self.db.execute(
            select(FieldEvent)
            .options(selectinload(FieldEvent.event_participants))
            .where(
                FieldEvent.id == event_id,
                FieldEvent.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_events(
        self,
        page: int = 1,
        per_page: int = 20,
        status: FieldEventStatus | None = None,
        collection_site_id: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        sort: str = "event_date",
        order: str = "desc",
    ) -> tuple[list[FieldEvent], int]:
        """List field events with pagination and filters."""
        query = select(FieldEvent).where(FieldEvent.is_deleted == False)  # noqa: E712

        # C-06: Sort column allowlist
        ALLOWED_SORTS = {
            "event_date", "event_name", "created_at", "status",
            "expected_participants", "actual_participants", "wave",
        }

        if status:
            query = query.where(FieldEvent.status == status)
        if collection_site_id:
            query = query.where(FieldEvent.collection_site_id == collection_site_id)
        if date_from:
            query = query.where(FieldEvent.event_date >= date_from)
        if date_to:
            query = query.where(FieldEvent.event_date <= date_to)

        safe_sort = sort if sort in ALLOWED_SORTS else "event_date"
        sort_col = getattr(FieldEvent, safe_sort, FieldEvent.event_date)
        if order == "asc":
            query = query.order_by(sort_col.asc())
        else:
            query = query.order_by(sort_col.desc())

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def update_event(
        self,
        event_id: uuid.UUID,
        data: FieldEventUpdate,
        updated_by: uuid.UUID,
    ) -> FieldEvent | None:
        """Update a field event with status transition validation."""
        event = await self.get_event(event_id)
        if event is None:
            return None

        old_values = {}
        new_values = {}

        for field, value in data.model_dump(exclude_unset=True).items():
            if field == "status" and value is not None:
                # Validate status transition
                new_status = FieldEventStatus(value)
                current_status = event.status or FieldEventStatus.PLANNED
                allowed = VALID_STATUS_TRANSITIONS.get(current_status, set())
                if new_status not in allowed:
                    raise ValueError(
                        f"Cannot transition from {current_status.value} to {new_status.value}."
                    )
                old_values["status"] = current_status.value
                event.status = new_status
                new_values["status"] = new_status.value
                continue

            current = getattr(event, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(event, field, value)
                new_values[field] = str(value) if value is not None else None

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="field_event",
                entity_id=event.id,
                old_values=old_values,
                new_values=new_values,
            ))
        return event

    # --- Participant Management ---

    async def add_participants(
        self,
        event_id: uuid.UUID,
        participant_ids: list[uuid.UUID],
        added_by: uuid.UUID,
    ) -> list[FieldEventParticipant]:
        """Bulk-add participants to an event.

        Enforces:
        - No duplicate participant within the same event (via DB constraint).
        - No participant in two concurrent same-day events.
        """
        event = await self.get_event(event_id)
        if event is None:
            raise ValueError("Field event not found.")

        # Check for participants already in another event on the same day
        conflict_q = select(FieldEventParticipant.participant_id).join(
            FieldEvent, FieldEventParticipant.event_id == FieldEvent.id
        ).where(
            FieldEvent.event_date == event.event_date,
            FieldEvent.id != event_id,
            FieldEvent.is_deleted == False,  # noqa: E712
            FieldEvent.status.in_([
                FieldEventStatus.PLANNED,
                FieldEventStatus.IN_PROGRESS,
            ]),
            FieldEventParticipant.participant_id.in_(participant_ids),
        )
        conflict_result = await self.db.execute(conflict_q)
        conflicting = set(conflict_result.scalars().all())
        if conflicting:
            raise ValueError(
                f"Participants already assigned to another same-day event: "
                f"{[str(c) for c in conflicting]}"
            )

        # Check for existing assignments in this event
        existing_q = select(FieldEventParticipant.participant_id).where(
            FieldEventParticipant.event_id == event_id,
            FieldEventParticipant.participant_id.in_(participant_ids),
        )
        existing_result = await self.db.execute(existing_q)
        existing_set = set(existing_result.scalars().all())

        added = []
        for pid in participant_ids:
            if pid in existing_set:
                continue
            fep = FieldEventParticipant(
                id=uuid.uuid4(),
                event_id=event_id,
                participant_id=pid,
            )
            self.db.add(fep)
            added.append(fep)

        if added:
            await self.db.flush()

            # Update actual_participants count
            count_q = select(func.count()).where(
                FieldEventParticipant.event_id == event_id
            )
            new_count = (await self.db.execute(count_q)).scalar_one()
            event.actual_participants = new_count

            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=added_by,
                action=AuditAction.UPDATE,
                entity_type="field_event",
                entity_id=event_id,
                new_values={
                    "added_participants": len(added),
                    "actual_participants": new_count,
                },
            ))

        return added

    async def check_in_participant(
        self,
        event_id: uuid.UUID,
        data: CheckInRequest,
        recorded_by: uuid.UUID,
    ) -> FieldEventParticipant | None:
        """Record check-in for a participant at a field event."""
        result = await self.db.execute(
            select(FieldEventParticipant).where(
                FieldEventParticipant.event_id == event_id,
                FieldEventParticipant.participant_id == data.participant_id,
            )
        )
        fep = result.scalar_one_or_none()
        if fep is None:
            return None

        now = datetime.now(timezone.utc)
        fep.check_in_time = now
        fep.wrist_tag_issued = data.wrist_tag_issued
        fep.consent_verified = data.consent_verified
        fep.notes = data.notes
        fep.recorded_by = recorded_by
        fep.recorded_at = now

        # Update actual_participants count (count checked-in)
        event = await self.get_event(event_id)
        if event:
            count_q = select(func.count()).where(
                FieldEventParticipant.event_id == event_id,
                FieldEventParticipant.check_in_time.is_not(None),
            )
            checked_in_count = (await self.db.execute(count_q)).scalar_one()
            event.actual_participants = checked_in_count

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=recorded_by,
            action=AuditAction.UPDATE,
            entity_type="field_event_participant",
            entity_id=fep.id,
            new_values={
                "check_in_time": now.isoformat(),
                "wrist_tag_issued": data.wrist_tag_issued,
                "consent_verified": data.consent_verified,
            },
        ))
        return fep

    async def bulk_digitize(
        self,
        event_id: uuid.UUID,
        items: list[BulkDigitizeItem],
        recorded_by: uuid.UUID,
    ) -> list[FieldEventParticipant]:
        """Bulk update participant records from paper forms."""
        event = await self.get_event(event_id)
        if event is None:
            raise ValueError("Field event not found.")

        updated = []
        for item in items:
            result = await self.db.execute(
                select(FieldEventParticipant).where(
                    FieldEventParticipant.event_id == event_id,
                    FieldEventParticipant.participant_id == item.participant_id,
                )
            )
            fep = result.scalar_one_or_none()
            if fep is None:
                # Auto-add participant if not yet in event
                fep = FieldEventParticipant(
                    id=uuid.uuid4(),
                    event_id=event_id,
                    participant_id=item.participant_id,
                )
                self.db.add(fep)

            now = datetime.now(timezone.utc)
            fep.check_in_time = item.check_in_time or now
            fep.samples_collected = item.samples_collected
            fep.partner_samples = item.partner_samples
            fep.stool_kit_issued = item.stool_kit_issued
            fep.urine_collected = item.urine_collected
            fep.notes = item.notes
            fep.recorded_by = recorded_by
            fep.recorded_at = now
            updated.append(fep)

        await self.db.flush()

        # Update actual_participants count
        count_q = select(func.count()).where(
            FieldEventParticipant.event_id == event_id,
        )
        new_count = (await self.db.execute(count_q)).scalar_one()
        event.actual_participants = new_count

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=recorded_by,
            action=AuditAction.UPDATE,
            entity_type="field_event",
            entity_id=event_id,
            new_values={
                "bulk_digitize_count": len(updated),
                "actual_participants": new_count,
            },
            additional_context={"event": "bulk_digitize"},
        ))
        return updated

    async def get_event_roster(
        self,
        event_id: uuid.UUID,
    ) -> list[dict]:
        """Get participant roster with check-in status for PDF/roster generation."""
        result = await self.db.execute(
            select(
                FieldEventParticipant,
                Participant.participant_code,
            )
            .join(
                Participant,
                FieldEventParticipant.participant_id == Participant.id,
            )
            .where(FieldEventParticipant.event_id == event_id)
            .order_by(Participant.participant_code.asc())
        )
        rows = result.all()

        roster = []
        for fep, participant_code in rows:
            roster.append({
                "id": fep.id,
                "event_id": fep.event_id,
                "participant_id": fep.participant_id,
                "participant_code": participant_code,
                "check_in_time": fep.check_in_time,
                "wrist_tag_issued": fep.wrist_tag_issued,
                "consent_verified": fep.consent_verified,
                "samples_collected": fep.samples_collected,
                "partner_samples": fep.partner_samples,
                "stool_kit_issued": fep.stool_kit_issued,
                "urine_collected": fep.urine_collected,
                "notes": fep.notes,
                "recorded_by": fep.recorded_by,
                "recorded_at": fep.recorded_at,
                "sync_status": fep.sync_status,
                "offline_id": fep.offline_id,
                "checked_in": fep.check_in_time is not None,
            })
        return roster
