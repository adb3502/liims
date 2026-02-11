"""Participant and consent service layer."""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import AuditAction, SampleType
from app.models.participant import CollectionSite, Consent, Participant
from app.models.sample import Sample
from app.models.user import AuditLog
from app.schemas.participant import (
    ConsentCreate,
    ConsentUpdate,
    ParticipantCreate,
    ParticipantUpdate,
)

logger = logging.getLogger(__name__)


class ParticipantService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- Participant CRUD ---

    async def create_participant(
        self,
        data: ParticipantCreate,
        created_by: uuid.UUID | None = None,
    ) -> Participant:
        participant = Participant(
            id=uuid.uuid4(),
            participant_code=data.participant_code,
            group_code=data.group_code,
            participant_number=data.participant_number,
            age_group=data.age_group,
            sex=data.sex,
            date_of_birth=data.date_of_birth,
            collection_site_id=data.collection_site_id,
            enrollment_date=data.enrollment_date,
            enrollment_source=data.enrollment_source,
            odk_submission_id=data.odk_submission_id,
            wave=data.wave,
            created_by=created_by,
        )
        self.db.add(participant)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="participant",
            entity_id=participant.id,
            new_values={"participant_code": participant.participant_code},
        ))
        return participant

    async def get_participant(self, participant_id: uuid.UUID) -> Participant | None:
        result = await self.db.execute(
            select(Participant)
            .options(
                selectinload(Participant.consents),
                selectinload(Participant.collection_site),
            )
            .where(
                Participant.id == participant_id,
                Participant.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_sample_counts(self, participant_id: uuid.UUID) -> dict:
        """Get sample counts by type for a participant."""
        result = await self.db.execute(
            select(Sample.sample_type, func.count(Sample.id))
            .where(
                Sample.participant_id == participant_id,
                Sample.is_deleted == False,  # noqa: E712
            )
            .group_by(Sample.sample_type)
        )
        return {row[0].value: row[1] for row in result.all()}

    async def list_participants(
        self,
        page: int = 1,
        per_page: int = 20,
        search: str | None = None,
        collection_site_id: uuid.UUID | None = None,
        age_group: int | None = None,
        sex: str | None = None,
        wave: int | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> tuple[list[Participant], int]:
        query = select(Participant).where(
            Participant.is_deleted == False  # noqa: E712
        )

        if search:
            # Use pg_trgm similarity for fuzzy search
            query = query.where(
                text("similarity(participant.participant_code, :search) > 0.1")
            ).params(search=search)
            # Order by similarity when searching
            query = query.order_by(
                text("similarity(participant.participant_code, :search) DESC")
            ).params(search=search)
        else:
            # Standard ordering
            sort_col = getattr(Participant, sort, Participant.created_at)
            if order == "asc":
                query = query.order_by(sort_col.asc())
            else:
                query = query.order_by(sort_col.desc())

        if collection_site_id:
            query = query.where(Participant.collection_site_id == collection_site_id)
        if age_group is not None:
            query = query.where(Participant.age_group == age_group)
        if sex:
            query = query.where(Participant.sex == sex)
        if wave is not None:
            query = query.where(Participant.wave == wave)

        # Count total
        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        # Paginate
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def update_participant(
        self,
        participant_id: uuid.UUID,
        data: ParticipantUpdate,
        updated_by: uuid.UUID,
    ) -> Participant | None:
        participant = await self.get_participant(participant_id)
        if participant is None:
            return None

        old_values = {}
        new_values = {}
        update_data = data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            current = getattr(participant, field)
            # Normalize for comparison
            if hasattr(current, "value"):
                current_cmp = current.value
            else:
                current_cmp = current
            if hasattr(value, "value"):
                value_cmp = value.value
            else:
                value_cmp = value

            if value_cmp != current_cmp:
                old_values[field] = str(current_cmp) if current_cmp is not None else None
                setattr(participant, field, value)
                new_values[field] = str(value_cmp) if value_cmp is not None else None

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="participant",
                entity_id=participant.id,
                old_values=old_values,
                new_values=new_values,
            ))

        return participant

    async def soft_delete_participant(
        self, participant_id: uuid.UUID, deleted_by: uuid.UUID
    ) -> bool:
        result = await self.db.execute(
            select(Participant).where(
                Participant.id == participant_id,
                Participant.is_deleted == False,  # noqa: E712
            )
        )
        participant = result.scalar_one_or_none()
        if participant is None:
            return False

        participant.is_deleted = True
        participant.deleted_at = datetime.now(timezone.utc)

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=deleted_by,
            action=AuditAction.DELETE,
            entity_type="participant",
            entity_id=participant.id,
        ))
        return True

    # --- Consent ---

    async def list_consents(self, participant_id: uuid.UUID) -> list[Consent]:
        result = await self.db.execute(
            select(Consent).where(
                Consent.participant_id == participant_id,
                Consent.is_deleted == False,  # noqa: E712
            ).order_by(Consent.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_consent(
        self,
        participant_id: uuid.UUID,
        data: ConsentCreate,
        created_by: uuid.UUID,
    ) -> Consent:
        consent = Consent(
            id=uuid.uuid4(),
            participant_id=participant_id,
            consent_type=data.consent_type,
            consent_given=data.consent_given,
            consent_date=data.consent_date,
            is_proxy=data.is_proxy,
            witness_name=data.witness_name,
            form_version=data.form_version,
            created_by=created_by,
        )
        self.db.add(consent)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="consent",
            entity_id=consent.id,
            new_values={
                "participant_id": str(participant_id),
                "consent_type": data.consent_type.value,
                "consent_given": data.consent_given,
            },
        ))
        return consent

    async def update_consent(
        self,
        consent_id: uuid.UUID,
        data: ConsentUpdate,
        updated_by: uuid.UUID,
    ) -> Consent | None:
        result = await self.db.execute(
            select(Consent).where(
                Consent.id == consent_id,
                Consent.is_deleted == False,  # noqa: E712
            )
        )
        consent = result.scalar_one_or_none()
        if consent is None:
            return None

        old_values = {}
        new_values = {}
        update_data = data.model_dump(exclude_unset=True)

        for field, value in update_data.items():
            current = getattr(consent, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(consent, field, value)
                new_values[field] = str(value) if value is not None else None

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="consent",
                entity_id=consent.id,
                old_values=old_values,
                new_values=new_values,
            ))

        return consent


class CollectionSiteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_site(
        self, name: str, code: str, range_start: int, range_end: int,
        city: str = "Bangalore", address: str | None = None,
        created_by: uuid.UUID | None = None,
    ) -> CollectionSite:
        site = CollectionSite(
            id=uuid.uuid4(),
            name=name,
            code=code,
            participant_range_start=range_start,
            participant_range_end=range_end,
            city=city,
            address=address,
            created_by=created_by,
        )
        self.db.add(site)
        await self.db.flush()
        return site

    async def get_site(self, site_id: uuid.UUID) -> CollectionSite | None:
        result = await self.db.execute(
            select(CollectionSite).where(
                CollectionSite.id == site_id,
                CollectionSite.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def get_site_by_code(self, code: str) -> CollectionSite | None:
        result = await self.db.execute(
            select(CollectionSite).where(
                CollectionSite.code == code,
                CollectionSite.is_deleted == False,  # noqa: E712
            )
        )
        return result.scalar_one_or_none()

    async def list_sites(self, is_active: bool | None = None) -> list[CollectionSite]:
        query = select(CollectionSite).where(
            CollectionSite.is_deleted == False  # noqa: E712
        )
        if is_active is not None:
            query = query.where(CollectionSite.is_active == is_active)
        query = query.order_by(CollectionSite.code.asc())
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_site(
        self, site_id: uuid.UUID, **kwargs
    ) -> CollectionSite | None:
        site = await self.get_site(site_id)
        if site is None:
            return None
        for k, v in kwargs.items():
            if v is not None and hasattr(site, k):
                setattr(site, k, v)
        return site
