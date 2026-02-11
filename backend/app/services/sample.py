"""Sample lifecycle service: CRUD, volume tracking, aliquots, discards."""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import (
    AuditAction,
    DiscardReason,
    DiscardRequestStatus,
    SampleStatus,
    SampleType,
)
from app.models.sample import (
    Sample,
    SampleDiscardRequest,
    SampleStatusHistory,
    SampleTransport,
    SampleTransportItem,
)
from app.models.storage import StoragePosition
from app.models.user import AuditLog
from app.schemas.sample import (
    DiscardRequestCreate,
    SampleCreate,
    SampleStatusUpdate,
    SampleUpdate,
    TransportCreate,
)

logger = logging.getLogger(__name__)

# Valid status transitions
VALID_TRANSITIONS: dict[SampleStatus, set[SampleStatus]] = {
    SampleStatus.REGISTERED: {SampleStatus.COLLECTED},
    SampleStatus.COLLECTED: {SampleStatus.TRANSPORTED, SampleStatus.PROCESSING},
    SampleStatus.TRANSPORTED: {SampleStatus.RECEIVED},
    SampleStatus.RECEIVED: {SampleStatus.PROCESSING, SampleStatus.STORED},
    SampleStatus.PROCESSING: {SampleStatus.STORED},
    SampleStatus.STORED: {SampleStatus.RESERVED, SampleStatus.IN_ANALYSIS, SampleStatus.PENDING_DISCARD},
    SampleStatus.RESERVED: {SampleStatus.IN_ANALYSIS, SampleStatus.STORED},
    SampleStatus.IN_ANALYSIS: {SampleStatus.STORED, SampleStatus.DEPLETED},
    SampleStatus.PENDING_DISCARD: {SampleStatus.DISCARDED, SampleStatus.STORED},
    SampleStatus.DEPLETED: set(),
    SampleStatus.DISCARDED: set(),
}

# Auto-aliquot rules: sample_type -> list of (subtype, volume_ul)
ALIQUOT_RULES: dict[SampleType, list[tuple[str, Decimal | None]]] = {
    SampleType.PLASMA: [
        ("P1", Decimal("500.00")),
        ("P2", Decimal("500.00")),
        ("P3", Decimal("500.00")),
        ("P4", Decimal("500.00")),
        ("P5", Decimal("500.00")),
    ],
    SampleType.EPIGENETICS: [
        ("E1", Decimal("570.00")),
        ("E2", Decimal("570.00")),
        ("E3", Decimal("570.00")),
        ("E4", Decimal("570.00")),
    ],
    SampleType.URINE: [
        ("U", Decimal("3750.00")),
    ],
    SampleType.HAIR: [
        ("H1", None),
        ("H2", None),
    ],
    SampleType.CHEEK_SWAB: [
        ("CS1", None),
    ],
    SampleType.RBC_SMEAR: [
        ("R1", None),
    ],
    SampleType.EXTRA_BLOOD: [
        ("B1", None),
    ],
}


def _generate_sample_code(participant_code: str, subtype: str) -> str:
    """Generate sample code: {participant_code}-{subtype}."""
    return f"{participant_code}-{subtype}"


class SampleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- CRUD ---

    async def create_sample(
        self,
        data: SampleCreate,
        created_by: uuid.UUID,
        participant_code: str | None = None,
    ) -> Sample:
        """Create a single sample."""
        # Build sample code
        subtype = data.sample_subtype or data.sample_type.value.upper()[:2]
        code = _generate_sample_code(participant_code or "", subtype) if participant_code else subtype

        sample = Sample(
            id=uuid.uuid4(),
            sample_code=code,
            participant_id=data.participant_id,
            sample_type=data.sample_type,
            sample_subtype=data.sample_subtype,
            parent_sample_id=data.parent_sample_id,
            status=SampleStatus.REGISTERED,
            initial_volume_ul=data.initial_volume_ul,
            remaining_volume_ul=data.initial_volume_ul,
            collection_site_id=data.collection_site_id,
            wave=data.wave,
            notes=data.notes,
            created_by=created_by,
        )
        self.db.add(sample)
        await self.db.flush()

        # Initial status history entry
        self._add_status_history(
            sample.id, None, SampleStatus.REGISTERED, created_by, "Sample registered"
        )

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="sample",
            entity_id=sample.id,
            new_values={"sample_code": sample.sample_code, "sample_type": sample.sample_type.value},
        ))
        return sample

    async def auto_generate_aliquots(
        self,
        parent_sample_id: uuid.UUID,
        created_by: uuid.UUID,
    ) -> list[Sample]:
        """Auto-generate aliquots based on rules for the parent sample type."""
        parent = await self.get_sample(parent_sample_id)
        if parent is None:
            return []

        rules = ALIQUOT_RULES.get(parent.sample_type, [])
        if not rules:
            return []

        # Get participant code for naming
        from app.models.participant import Participant
        p_result = await self.db.execute(
            select(Participant.participant_code).where(Participant.id == parent.participant_id)
        )
        participant_code = p_result.scalar_one_or_none() or ""

        aliquots = []
        for subtype, volume in rules:
            code = _generate_sample_code(participant_code, subtype)

            # Skip if already exists
            existing = await self.db.execute(
                select(Sample.id).where(Sample.sample_code == code)
            )
            if existing.scalar_one_or_none() is not None:
                continue

            aliquot = Sample(
                id=uuid.uuid4(),
                sample_code=code,
                participant_id=parent.participant_id,
                sample_type=parent.sample_type,
                sample_subtype=subtype,
                parent_sample_id=parent.id,
                status=SampleStatus.REGISTERED,
                initial_volume_ul=volume,
                remaining_volume_ul=volume,
                collection_site_id=parent.collection_site_id,
                wave=parent.wave,
                created_by=created_by,
            )
            self.db.add(aliquot)
            aliquots.append(aliquot)

        await self.db.flush()

        for a in aliquots:
            self._add_status_history(
                a.id, None, SampleStatus.REGISTERED, created_by, "Auto-generated aliquot"
            )

        return aliquots

    async def get_sample(self, sample_id: uuid.UUID) -> Sample | None:
        result = await self.db.execute(
            select(Sample)
            .options(
                selectinload(Sample.status_history),
                selectinload(Sample.aliquots),
            )
            .where(
                Sample.id == sample_id,
                Sample.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_samples(
        self,
        page: int = 1,
        per_page: int = 20,
        search: str | None = None,
        participant_id: uuid.UUID | None = None,
        sample_type: SampleType | None = None,
        status: SampleStatus | None = None,
        wave: int | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> tuple[list[Sample], int]:
        query = select(Sample).where(Sample.is_deleted == False)  # noqa: E712

        # C-06: Sort column allowlist
        ALLOWED_SORTS = {
            "created_at", "sample_code", "collection_datetime",
            "status", "sample_type", "wave",
        }

        if search:
            query = query.where(
                text("similarity(sample.sample_code, :search) > 0.1")
            ).params(search=search)
            query = query.order_by(
                text("similarity(sample.sample_code, :search) DESC")
            ).params(search=search)
        else:
            safe_sort = sort if sort in ALLOWED_SORTS else "created_at"
            sort_col = getattr(Sample, safe_sort, Sample.created_at)
            if order == "asc":
                query = query.order_by(sort_col.asc())
            else:
                query = query.order_by(sort_col.desc())

        if participant_id:
            query = query.where(Sample.participant_id == participant_id)
        if sample_type:
            query = query.where(Sample.sample_type == sample_type)
        if status:
            query = query.where(Sample.status == status)
        if wave is not None:
            query = query.where(Sample.wave == wave)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def update_sample(
        self,
        sample_id: uuid.UUID,
        data: SampleUpdate,
        updated_by: uuid.UUID,
    ) -> Sample | None:
        sample = await self.get_sample(sample_id)
        if sample is None:
            return None

        old_values = {}
        new_values = {}
        for field, value in data.model_dump(exclude_unset=True).items():
            current = getattr(sample, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(sample, field, value)
                new_values[field] = str(value) if value is not None else None

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="sample",
                entity_id=sample.id,
                old_values=old_values,
                new_values=new_values,
            ))
        return sample

    # --- Status transitions ---

    async def update_status(
        self,
        sample_id: uuid.UUID,
        data: SampleStatusUpdate,
        changed_by: uuid.UUID,
    ) -> Sample | None:
        sample = await self.get_sample(sample_id)
        if sample is None:
            return None

        # Validate transition
        allowed = VALID_TRANSITIONS.get(sample.status, set())
        if data.status not in allowed:
            raise ValueError(
                f"Cannot transition from {sample.status.value} to {data.status.value}."
            )

        old_status = sample.status
        sample.status = data.status

        # Set processing_started_at on transition to PROCESSING
        if data.status == SampleStatus.PROCESSING and sample.processing_started_at is None:
            sample.processing_started_at = datetime.now(timezone.utc)

        # Set collection_datetime on transition to COLLECTED
        if data.status == SampleStatus.COLLECTED and sample.collection_datetime is None:
            sample.collection_datetime = datetime.now(timezone.utc)

        # Set storage_datetime on transition to STORED
        if data.status == SampleStatus.STORED and sample.storage_datetime is None:
            sample.storage_datetime = datetime.now(timezone.utc)

        self._add_status_history(
            sample.id, old_status, data.status, changed_by,
            data.notes, data.location_context, data.storage_rule_override_reason,
        )

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=changed_by,
            action=AuditAction.UPDATE,
            entity_type="sample",
            entity_id=sample.id,
            old_values={"status": old_status.value},
            new_values={"status": data.status.value},
        ))
        return sample

    # --- Volume tracking ---

    async def withdraw_volume(
        self,
        sample_id: uuid.UUID,
        volume_ul: Decimal,
        withdrawn_by: uuid.UUID,
        reason: str | None = None,
    ) -> Sample | None:
        sample = await self.get_sample(sample_id)
        if sample is None:
            return None
        if sample.remaining_volume_ul is None:
            raise ValueError("This sample does not track volume.")
        if volume_ul > sample.remaining_volume_ul:
            raise ValueError(
                f"Insufficient volume. Remaining: {sample.remaining_volume_ul} uL, requested: {volume_ul} uL."
            )

        old_volume = sample.remaining_volume_ul
        sample.remaining_volume_ul -= volume_ul

        # Mark as depleted if volume reaches 0
        if sample.remaining_volume_ul <= 0:
            old_status = sample.status
            sample.status = SampleStatus.DEPLETED
            self._add_status_history(
                sample.id, old_status, SampleStatus.DEPLETED, withdrawn_by,
                "Auto-depleted: volume reached 0",
            )

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=withdrawn_by,
            action=AuditAction.UPDATE,
            entity_type="sample",
            entity_id=sample.id,
            old_values={"remaining_volume_ul": str(old_volume)},
            new_values={"remaining_volume_ul": str(sample.remaining_volume_ul)},
            additional_context={"event": "volume_withdrawal", "reason": reason},
        ))
        return sample

    # --- Discard workflow ---

    async def create_discard_request(
        self,
        sample_id: uuid.UUID,
        data: DiscardRequestCreate,
        requested_by: uuid.UUID,
    ) -> SampleDiscardRequest:
        request = SampleDiscardRequest(
            id=uuid.uuid4(),
            sample_id=sample_id,
            requested_by=requested_by,
            requested_at=datetime.now(timezone.utc),
            reason=data.reason,
            reason_notes=data.reason_notes,
            status=DiscardRequestStatus.PENDING,
        )
        self.db.add(request)
        await self.db.flush()

        # Update sample status to pending_discard
        sample = await self.get_sample(sample_id)
        if sample and sample.status not in (SampleStatus.DEPLETED, SampleStatus.DISCARDED):
            old_status = sample.status
            sample.status = SampleStatus.PENDING_DISCARD
            self._add_status_history(
                sample.id, old_status, SampleStatus.PENDING_DISCARD, requested_by,
                f"Discard requested: {data.reason.value}",
            )

        return request

    async def approve_discard(
        self,
        request_id: uuid.UUID,
        approved: bool,
        approved_by: uuid.UUID,
        rejection_reason: str | None = None,
    ) -> SampleDiscardRequest | None:
        result = await self.db.execute(
            select(SampleDiscardRequest).where(SampleDiscardRequest.id == request_id)
        )
        discard_req = result.scalar_one_or_none()
        if discard_req is None:
            return None

        now = datetime.now(timezone.utc)
        discard_req.approved_by = approved_by
        discard_req.approved_at = now

        if approved:
            discard_req.status = DiscardRequestStatus.APPROVED

            # Update sample to discarded and clear storage
            sample = await self.get_sample(discard_req.sample_id)
            if sample:
                old_status = sample.status
                sample.status = SampleStatus.DISCARDED
                self._add_status_history(
                    sample.id, old_status, SampleStatus.DISCARDED, approved_by,
                    "Discard approved",
                )
                # Release storage position
                if sample.storage_location_id:
                    pos_result = await self.db.execute(
                        select(StoragePosition).where(
                            StoragePosition.id == sample.storage_location_id
                        )
                    )
                    position = pos_result.scalar_one_or_none()
                    if position:
                        position.sample_id = None
                        position.occupied_at = None
                    sample.storage_location_id = None
        else:
            discard_req.status = DiscardRequestStatus.REJECTED
            discard_req.rejection_reason = rejection_reason

            # Revert sample status from pending_discard back to stored
            sample = await self.get_sample(discard_req.sample_id)
            if sample and sample.status == SampleStatus.PENDING_DISCARD:
                sample.status = SampleStatus.STORED
                self._add_status_history(
                    sample.id, SampleStatus.PENDING_DISCARD, SampleStatus.STORED,
                    approved_by, "Discard request rejected",
                )

        return discard_req

    async def list_discard_requests(
        self, status: DiscardRequestStatus | None = None
    ) -> list[SampleDiscardRequest]:
        query = select(SampleDiscardRequest)
        if status:
            query = query.where(SampleDiscardRequest.status == status)
        query = query.order_by(SampleDiscardRequest.requested_at.desc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # --- Transport ---

    async def create_transport(
        self,
        data: TransportCreate,
        recorded_by: uuid.UUID,
    ) -> SampleTransport:
        transport = SampleTransport(
            id=uuid.uuid4(),
            field_event_id=data.field_event_id,
            transport_type=data.transport_type,
            origin=data.origin,
            destination=data.destination,
            departure_time=data.departure_time,
            cold_chain_method=data.cold_chain_method,
            courier_name=data.courier_name,
            notes=data.notes,
            recorded_by=recorded_by,
            created_by=recorded_by,
            sample_count=sum(1 for i in data.items if i.sample_id),
            box_count=sum(1 for i in data.items if i.box_id),
        )
        self.db.add(transport)
        await self.db.flush()

        for item in data.items:
            self.db.add(SampleTransportItem(
                id=uuid.uuid4(),
                transport_id=transport.id,
                sample_id=item.sample_id,
                box_id=item.box_id,
            ))

        return transport

    async def list_transports(
        self, page: int = 1, per_page: int = 20
    ) -> tuple[list[SampleTransport], int]:
        query = select(SampleTransport).order_by(SampleTransport.created_at.desc())
        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    # --- Helpers ---

    def _add_status_history(
        self,
        sample_id: uuid.UUID,
        previous: SampleStatus | None,
        new: SampleStatus,
        changed_by: uuid.UUID,
        notes: str | None = None,
        location_context: str | None = None,
        override_reason: str | None = None,
    ) -> None:
        self.db.add(SampleStatusHistory(
            id=uuid.uuid4(),
            sample_id=sample_id,
            previous_status=previous,
            new_status=new,
            changed_at=datetime.now(timezone.utc),
            changed_by=changed_by,
            notes=notes,
            location_context=location_context,
            storage_rule_override_reason=override_reason,
        ))
