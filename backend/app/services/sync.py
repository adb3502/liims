"""Offline sync service for processing batched mutations from field devices."""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AuditAction, SyncStatus
from app.models.participant import Participant
from app.models.sample import Sample
from app.models.user import AuditLog

logger = logging.getLogger(__name__)


class SyncConflict:
    """Represents a conflict between an offline mutation and server state."""

    def __init__(
        self,
        entity_type: str,
        entity_id: str,
        field: str,
        client_value: str | None,
        server_value: str | None,
        resolved_value: str | None,
    ):
        self.entity_type = entity_type
        self.entity_id = entity_id
        self.field = field
        self.client_value = client_value
        self.server_value = server_value
        self.resolved_value = resolved_value

    def to_dict(self) -> dict:
        return {
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "field": self.field,
            "client_value": self.client_value,
            "server_value": self.server_value,
            "resolved_value": self.resolved_value,
        }


# Mutation types supported for offline sync
SUPPORTED_MUTATIONS = {
    "participant_checkin",
    "sample_register",
    "sample_status_update",
    "stool_kit_issue",
    "event_participant_update",
}


class SyncService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def process_push(
        self,
        mutations: list[dict],
        user_id: uuid.UUID,
        device_id: str | None = None,
    ) -> dict:
        """Process a batch of offline mutations.

        Returns summary with applied count, conflict count, and conflict details.
        Strategy: server wins on conflicts, client is notified.
        """
        applied = 0
        skipped = 0
        conflicts: list[dict] = []
        errors: list[dict] = []

        for mutation in mutations:
            mutation_type = mutation.get("type")
            entity_id = mutation.get("entity_id")
            client_timestamp = mutation.get("timestamp")
            payload = mutation.get("payload", {})

            if mutation_type not in SUPPORTED_MUTATIONS:
                errors.append({
                    "mutation_id": mutation.get("id"),
                    "error": f"Unsupported mutation type: {mutation_type}",
                })
                continue

            try:
                result = await self._apply_mutation(
                    mutation_type=mutation_type,
                    entity_id=entity_id,
                    client_timestamp=client_timestamp,
                    payload=payload,
                    user_id=user_id,
                )
                if result["status"] == "applied":
                    applied += 1
                elif result["status"] == "conflict":
                    conflicts.append(result["conflict"])
                    skipped += 1
                elif result["status"] == "skipped":
                    skipped += 1
            except Exception as exc:
                logger.warning(
                    "Failed to apply mutation %s: %s",
                    mutation.get("id"),
                    str(exc),
                )
                errors.append({
                    "mutation_id": mutation.get("id"),
                    "error": str(exc),
                })

        # Log the sync event
        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=user_id,
            action=AuditAction.UPDATE,
            entity_type="sync",
            entity_id=None,
            new_values={
                "event": "push",
                "device_id": device_id,
                "total": len(mutations),
                "applied": applied,
                "conflicts": len(conflicts),
                "errors": len(errors),
            },
        ))

        return {
            "total": len(mutations),
            "applied": applied,
            "skipped": skipped,
            "conflicts": conflicts,
            "errors": errors,
        }

    async def _apply_mutation(
        self,
        mutation_type: str,
        entity_id: str | None,
        client_timestamp: str | None,
        payload: dict,
        user_id: uuid.UUID,
    ) -> dict:
        """Apply a single mutation. Returns status and optional conflict info."""
        client_dt = None
        if client_timestamp:
            try:
                client_dt = datetime.fromisoformat(client_timestamp)
            except (ValueError, TypeError):
                pass

        if mutation_type == "participant_checkin":
            return await self._apply_participant_checkin(
                entity_id, client_dt, payload, user_id,
            )
        elif mutation_type == "sample_register":
            return await self._apply_sample_register(
                payload, user_id,
            )
        elif mutation_type == "sample_status_update":
            return await self._apply_sample_status_update(
                entity_id, client_dt, payload, user_id,
            )
        elif mutation_type in ("stool_kit_issue", "event_participant_update"):
            # These are simple upserts - apply directly
            return await self._apply_generic_update(
                mutation_type, entity_id, client_dt, payload, user_id,
            )

        return {"status": "skipped"}

    async def _apply_participant_checkin(
        self,
        entity_id: str | None,
        client_dt: datetime | None,
        payload: dict,
        user_id: uuid.UUID,
    ) -> dict:
        """Check in a participant - update fields from offline data."""
        if not entity_id:
            return {"status": "skipped"}

        result = await self.db.execute(
            select(Participant).where(
                Participant.id == uuid.UUID(entity_id),
                Participant.is_deleted == False,  # noqa: E712
            )
        )
        participant = result.scalar_one_or_none()
        if participant is None:
            return {"status": "skipped"}

        # Check for conflict: if server was updated after client timestamp
        if client_dt and participant.updated_at and participant.updated_at > client_dt:
            conflict = SyncConflict(
                entity_type="participant",
                entity_id=entity_id,
                field="updated_at",
                client_value=client_dt.isoformat() if client_dt else None,
                server_value=participant.updated_at.isoformat(),
                resolved_value=participant.updated_at.isoformat(),
            )
            return {"status": "conflict", "conflict": conflict.to_dict()}

        # Apply the check-in data
        changed = False
        for field in ("completion_pct",):
            if field in payload:
                setattr(participant, field, payload[field])
                changed = True

        if changed:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=user_id,
                action=AuditAction.UPDATE,
                entity_type="participant",
                entity_id=participant.id,
                new_values={"event": "offline_checkin", **payload},
            ))

        return {"status": "applied"}

    async def _apply_sample_register(
        self,
        payload: dict,
        user_id: uuid.UUID,
    ) -> dict:
        """Register a new sample from offline data."""
        participant_id = payload.get("participant_id")
        if not participant_id:
            return {"status": "skipped"}

        # Check participant exists
        p_result = await self.db.execute(
            select(Participant).where(
                Participant.id == uuid.UUID(participant_id),
                Participant.is_deleted == False,  # noqa: E712
            )
        )
        if p_result.scalar_one_or_none() is None:
            return {"status": "skipped"}

        # Check for duplicate by offline_id to prevent double-creates
        offline_id = payload.get("offline_id")
        if offline_id:
            existing = await self.db.execute(
                select(Sample.id).where(
                    Sample.notes.ilike(f"%offline_id:{offline_id}%"),
                )
            )
            if existing.scalar_one_or_none() is not None:
                return {"status": "skipped"}

        sample = Sample(
            id=uuid.uuid4(),
            participant_id=uuid.UUID(participant_id),
            sample_type=payload.get("sample_type", "plasma"),
            sample_subtype=payload.get("sample_subtype"),
            initial_volume_ul=payload.get("initial_volume_ul"),
            collection_site_id=uuid.UUID(payload["collection_site_id"]) if payload.get("collection_site_id") else None,
            wave=payload.get("wave", 1),
            notes=f"Registered offline. offline_id:{offline_id}" if offline_id else "Registered offline.",
            created_by=user_id,
        )
        self.db.add(sample)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=user_id,
            action=AuditAction.CREATE,
            entity_type="sample",
            entity_id=sample.id,
            new_values={
                "event": "offline_register",
                "offline_id": offline_id,
                "sample_type": sample.sample_type.value if hasattr(sample.sample_type, 'value') else str(sample.sample_type),
            },
        ))

        return {"status": "applied"}

    async def _apply_sample_status_update(
        self,
        entity_id: str | None,
        client_dt: datetime | None,
        payload: dict,
        user_id: uuid.UUID,
    ) -> dict:
        """Update sample status from offline data."""
        if not entity_id:
            return {"status": "skipped"}

        result = await self.db.execute(
            select(Sample).where(
                Sample.id == uuid.UUID(entity_id),
                Sample.is_deleted == False,  # noqa: E712
            )
        )
        sample = result.scalar_one_or_none()
        if sample is None:
            return {"status": "skipped"}

        # Conflict detection
        if client_dt and sample.updated_at and sample.updated_at > client_dt:
            conflict = SyncConflict(
                entity_type="sample",
                entity_id=entity_id,
                field="status",
                client_value=payload.get("status"),
                server_value=sample.status.value if hasattr(sample.status, 'value') else str(sample.status),
                resolved_value=sample.status.value if hasattr(sample.status, 'value') else str(sample.status),
            )
            return {"status": "conflict", "conflict": conflict.to_dict()}

        new_status = payload.get("status")
        if new_status:
            old_status = sample.status
            sample.status = new_status
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=user_id,
                action=AuditAction.UPDATE,
                entity_type="sample",
                entity_id=sample.id,
                old_values={"status": old_status.value if hasattr(old_status, 'value') else str(old_status)},
                new_values={"status": new_status, "event": "offline_status_update"},
            ))

        return {"status": "applied"}

    async def _apply_generic_update(
        self,
        mutation_type: str,
        entity_id: str | None,
        client_dt: datetime | None,
        payload: dict,
        user_id: uuid.UUID,
    ) -> dict:
        """Generic update handler for simple mutations."""
        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=user_id,
            action=AuditAction.UPDATE,
            entity_type=mutation_type,
            entity_id=uuid.UUID(entity_id) if entity_id else None,
            new_values={"event": f"offline_{mutation_type}", **payload},
        ))
        return {"status": "applied"}

    async def get_pull_data(
        self,
        user_id: uuid.UUID,
        since: datetime | None = None,
        entity_types: list[str] | None = None,
    ) -> dict:
        """Get data updated since the given timestamp for offline sync."""
        data: dict[str, list] = {}

        if not entity_types:
            entity_types = ["participants", "samples"]

        if "participants" in entity_types:
            query = select(Participant).where(
                Participant.is_deleted == False,  # noqa: E712
            )
            if since:
                query = query.where(Participant.updated_at > since)
            query = query.order_by(Participant.updated_at.desc()).limit(500)
            result = await self.db.execute(query)
            participants = result.scalars().all()
            data["participants"] = [
                {
                    "id": str(p.id),
                    "participant_code": p.participant_code,
                    "group_code": p.group_code,
                    "age_group": p.age_group.value if hasattr(p.age_group, 'value') else p.age_group,
                    "sex": p.sex.value if hasattr(p.sex, 'value') else p.sex,
                    "collection_site_id": str(p.collection_site_id) if p.collection_site_id else None,
                    "wave": p.wave,
                    "completion_pct": float(p.completion_pct) if p.completion_pct else 0,
                    "updated_at": p.updated_at.isoformat() if p.updated_at else None,
                }
                for p in participants
            ]

        if "samples" in entity_types:
            query = select(Sample).where(
                Sample.is_deleted == False,  # noqa: E712
            )
            if since:
                query = query.where(Sample.updated_at > since)
            query = query.order_by(Sample.updated_at.desc()).limit(1000)
            result = await self.db.execute(query)
            samples = result.scalars().all()
            data["samples"] = [
                {
                    "id": str(s.id),
                    "sample_code": s.sample_code,
                    "participant_id": str(s.participant_id),
                    "sample_type": s.sample_type.value if hasattr(s.sample_type, 'value') else str(s.sample_type),
                    "status": s.status.value if hasattr(s.status, 'value') else str(s.status),
                    "collection_site_id": str(s.collection_site_id) if s.collection_site_id else None,
                    "wave": s.wave,
                    "updated_at": s.updated_at.isoformat() if s.updated_at else None,
                }
                for s in samples
            ]

        return {
            "data": data,
            "sync_timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def get_sync_status(self, user_id: uuid.UUID) -> dict:
        """Get sync status for user's recent activity."""
        # Count recent sync audit logs for this user
        result = await self.db.execute(
            select(AuditLog)
            .where(
                AuditLog.user_id == user_id,
                AuditLog.entity_type == "sync",
            )
            .order_by(AuditLog.timestamp.desc())
            .limit(5)
        )
        logs = result.scalars().all()

        last_sync = None
        total_synced = 0
        total_conflicts = 0
        if logs:
            last_sync = logs[0].timestamp.isoformat() if logs[0].timestamp else None
            for log in logs:
                vals = log.new_values or {}
                total_synced += vals.get("applied", 0)
                total_conflicts += vals.get("conflicts", 0)

        return {
            "last_sync": last_sync,
            "recent_synced": total_synced,
            "recent_conflicts": total_conflicts,
            "status": "idle",
        }
