"""Dashboard analytics service with computed statistics."""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import (
    IccStatus,
    QCStatus,
    RunStatus,
    SampleStatus,
)
from app.models.field_ops import FieldEvent, FieldEventParticipant
from app.models.instrument import InstrumentRun
from app.models.omics import IccProcessing, OmicsResult, OmicsResultSet
from app.models.participant import CollectionSite, Participant
from app.models.partner import PartnerLabImport, PartnerLabResult
from app.models.sample import Sample
from app.models.storage import Freezer, StorageBox, StoragePosition, StorageRack

logger = logging.getLogger(__name__)


class DashboardService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Enrollment Summary ────────────────────────────────────────────

    async def enrollment_summary(self) -> dict:
        """Total participants, by site, by wave, enrollment rate over time."""
        # Total participants
        total_q = select(func.count()).where(
            Participant.is_deleted == False  # noqa: E712
        )
        total = (await self.db.execute(total_q)).scalar_one()

        # By collection site
        by_site_q = (
            select(
                CollectionSite.name,
                CollectionSite.code,
                func.count(Participant.id).label("count"),
            )
            .join(Participant, Participant.collection_site_id == CollectionSite.id)
            .where(Participant.is_deleted == False)  # noqa: E712
            .group_by(CollectionSite.name, CollectionSite.code)
            .order_by(func.count(Participant.id).desc())
        )
        by_site_rows = (await self.db.execute(by_site_q)).all()
        by_site = [
            {"site_name": r[0], "site_code": r[1], "count": r[2]}
            for r in by_site_rows
        ]

        # By wave
        by_wave_q = (
            select(
                Participant.wave,
                func.count(Participant.id).label("count"),
            )
            .where(Participant.is_deleted == False)  # noqa: E712
            .group_by(Participant.wave)
            .order_by(Participant.wave.asc())
        )
        by_wave_rows = (await self.db.execute(by_wave_q)).all()
        by_wave = [{"wave": r[0], "count": r[1]} for r in by_wave_rows]

        # Enrollment rate over last 30 days (by date)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        rate_q = (
            select(
                func.date_trunc("day", Participant.enrollment_date).label("day"),
                func.count(Participant.id).label("count"),
            )
            .where(
                Participant.is_deleted == False,  # noqa: E712
                Participant.enrollment_date >= thirty_days_ago,
            )
            .group_by(func.date_trunc("day", Participant.enrollment_date))
            .order_by(func.date_trunc("day", Participant.enrollment_date).asc())
        )
        rate_rows = (await self.db.execute(rate_q)).all()
        enrollment_rate = [
            {"date": r[0].isoformat() if r[0] else None, "count": r[1]}
            for r in rate_rows
        ]

        return {
            "total_participants": total,
            "by_site": by_site,
            "by_wave": by_wave,
            "enrollment_rate_30d": enrollment_rate,
        }

    # ── Sample Inventory ──────────────────────────────────────────────

    async def inventory_summary(self) -> dict:
        """Total samples, by type, by status, storage utilization."""
        # Total samples
        total_q = select(func.count()).where(
            Sample.is_deleted == False  # noqa: E712
        )
        total = (await self.db.execute(total_q)).scalar_one()

        # By type
        by_type_q = (
            select(
                Sample.sample_type,
                func.count(Sample.id).label("count"),
            )
            .where(Sample.is_deleted == False)  # noqa: E712
            .group_by(Sample.sample_type)
            .order_by(func.count(Sample.id).desc())
        )
        by_type_rows = (await self.db.execute(by_type_q)).all()
        by_type = [
            {"sample_type": r[0].value if r[0] else None, "count": r[1]}
            for r in by_type_rows
        ]

        # By status
        by_status_q = (
            select(
                Sample.status,
                func.count(Sample.id).label("count"),
            )
            .where(Sample.is_deleted == False)  # noqa: E712
            .group_by(Sample.status)
            .order_by(func.count(Sample.id).desc())
        )
        by_status_rows = (await self.db.execute(by_status_q)).all()
        by_status = [
            {"status": r[0].value if r[0] else None, "count": r[1]}
            for r in by_status_rows
        ]

        # Storage utilization: total positions vs occupied
        total_positions_q = select(func.count(StoragePosition.id))
        total_positions = (await self.db.execute(total_positions_q)).scalar_one()

        occupied_q = select(func.count()).where(
            StoragePosition.sample_id.isnot(None)
        )
        occupied = (await self.db.execute(occupied_q)).scalar_one()

        # Per-freezer utilization
        freezer_util_q = (
            select(
                Freezer.name,
                Freezer.freezer_type,
                func.count(StoragePosition.id).label("total_positions"),
                func.count(StoragePosition.sample_id).label("occupied"),
            )
            .join(StorageRack, StorageRack.freezer_id == Freezer.id)
            .join(StorageBox, StorageBox.rack_id == StorageRack.id)
            .join(StoragePosition, StoragePosition.box_id == StorageBox.id)
            .where(Freezer.is_deleted == False)  # noqa: E712
            .group_by(Freezer.name, Freezer.freezer_type)
            .order_by(Freezer.name.asc())
        )
        freezer_rows = (await self.db.execute(freezer_util_q)).all()
        freezer_utilization = [
            {
                "freezer_name": r[0],
                "freezer_type": r[1].value if r[1] else None,
                "total_positions": r[2],
                "occupied": r[3],
                "utilization_pct": round(r[3] / r[2] * 100, 1) if r[2] > 0 else 0,
            }
            for r in freezer_rows
        ]

        return {
            "total_samples": total,
            "by_type": by_type,
            "by_status": by_status,
            "storage": {
                "total_positions": total_positions,
                "occupied": occupied,
                "utilization_pct": round(occupied / total_positions * 100, 1) if total_positions > 0 else 0,
            },
            "freezer_utilization": freezer_utilization,
        }

    # ── Field Operations ──────────────────────────────────────────────

    async def field_ops_summary(self) -> dict:
        """Events by status, check-in rates, upcoming events."""
        # Events by status
        by_status_q = (
            select(
                FieldEvent.status,
                func.count(FieldEvent.id).label("count"),
            )
            .where(FieldEvent.is_deleted == False)  # noqa: E712
            .group_by(FieldEvent.status)
        )
        by_status_rows = (await self.db.execute(by_status_q)).all()
        by_status = [
            {"status": r[0].value if r[0] else "unknown", "count": r[1]}
            for r in by_status_rows
        ]

        # Total events
        total_events = sum(item["count"] for item in by_status)

        # Check-in rate: participants with check_in_time / total event_participants
        total_checkins_q = select(func.count(FieldEventParticipant.id))
        total_checkins = (await self.db.execute(total_checkins_q)).scalar_one()

        checked_in_q = select(func.count()).where(
            FieldEventParticipant.check_in_time.isnot(None)
        )
        checked_in = (await self.db.execute(checked_in_q)).scalar_one()

        # Upcoming events (next 30 days)
        today = date.today()
        upcoming_q = (
            select(
                FieldEvent.id,
                FieldEvent.event_name,
                FieldEvent.event_date,
                FieldEvent.status,
                FieldEvent.expected_participants,
            )
            .where(
                FieldEvent.is_deleted == False,  # noqa: E712
                FieldEvent.event_date >= today,
                FieldEvent.event_date <= today + timedelta(days=30),
            )
            .order_by(FieldEvent.event_date.asc())
            .limit(20)
        )
        upcoming_rows = (await self.db.execute(upcoming_q)).all()
        upcoming = [
            {
                "id": str(r[0]),
                "event_name": r[1],
                "event_date": r[2].isoformat() if r[2] else None,
                "status": r[3].value if r[3] else None,
                "expected_participants": r[4],
            }
            for r in upcoming_rows
        ]

        return {
            "total_events": total_events,
            "by_status": by_status,
            "check_in_rate": {
                "total_registrations": total_checkins,
                "checked_in": checked_in,
                "rate_pct": round(checked_in / total_checkins * 100, 1) if total_checkins > 0 else 0,
            },
            "upcoming_events": upcoming,
        }

    # ── Instrument Runs ───────────────────────────────────────────────

    async def instrument_summary(self) -> dict:
        """Runs by status, by type, completion rates, recent activity."""
        # By status
        by_status_q = (
            select(
                InstrumentRun.status,
                func.count(InstrumentRun.id).label("count"),
            )
            .where(InstrumentRun.is_deleted == False)  # noqa: E712
            .group_by(InstrumentRun.status)
        )
        by_status_rows = (await self.db.execute(by_status_q)).all()
        by_status = [
            {"status": r[0].value if r[0] else None, "count": r[1]}
            for r in by_status_rows
        ]

        # By run type
        by_type_q = (
            select(
                InstrumentRun.run_type,
                func.count(InstrumentRun.id).label("count"),
            )
            .where(InstrumentRun.is_deleted == False)  # noqa: E712
            .group_by(InstrumentRun.run_type)
        )
        by_type_rows = (await self.db.execute(by_type_q)).all()
        by_type = [
            {"run_type": r[0].value if r[0] else None, "count": r[1]}
            for r in by_type_rows
        ]

        # Completion rate
        total_runs_q = select(func.count()).where(
            InstrumentRun.is_deleted == False  # noqa: E712
        )
        total_runs = (await self.db.execute(total_runs_q)).scalar_one()

        completed_q = select(func.count()).where(
            InstrumentRun.is_deleted == False,  # noqa: E712
            InstrumentRun.status == RunStatus.COMPLETED,
        )
        completed = (await self.db.execute(completed_q)).scalar_one()

        # Recent runs (last 10)
        recent_q = (
            select(
                InstrumentRun.id,
                InstrumentRun.run_name,
                InstrumentRun.run_type,
                InstrumentRun.status,
                InstrumentRun.created_at,
            )
            .where(InstrumentRun.is_deleted == False)  # noqa: E712
            .order_by(InstrumentRun.created_at.desc())
            .limit(10)
        )
        recent_rows = (await self.db.execute(recent_q)).all()
        recent = [
            {
                "id": str(r[0]),
                "run_name": r[1],
                "run_type": r[2].value if r[2] else None,
                "status": r[3].value if r[3] else None,
                "created_at": r[4].isoformat() if r[4] else None,
            }
            for r in recent_rows
        ]

        return {
            "total_runs": total_runs,
            "by_status": by_status,
            "by_type": by_type,
            "completion_rate_pct": round(completed / total_runs * 100, 1) if total_runs > 0 else 0,
            "recent_runs": recent,
        }

    # ── Quality Metrics ───────────────────────────────────────────────

    async def quality_summary(self) -> dict:
        """QC pass/fail rates, ICC completion rates, omics coverage."""
        # QC pass/fail on instrument runs
        qc_q = (
            select(
                InstrumentRun.qc_status,
                func.count(InstrumentRun.id).label("count"),
            )
            .where(
                InstrumentRun.is_deleted == False,  # noqa: E712
                InstrumentRun.qc_status.isnot(None),
            )
            .group_by(InstrumentRun.qc_status)
        )
        qc_rows = (await self.db.execute(qc_q)).all()
        qc_by_status = {
            r[0].value if r[0] else "unknown": r[1] for r in qc_rows
        }
        qc_total = sum(qc_by_status.values())
        qc_passed = qc_by_status.get(QCStatus.PASSED.value, 0)

        # ICC completion rate
        icc_total_q = select(func.count(IccProcessing.id))
        icc_total = (await self.db.execute(icc_total_q)).scalar_one()

        icc_complete_q = select(func.count()).where(
            IccProcessing.status == IccStatus.ANALYSIS_COMPLETE
        )
        icc_complete = (await self.db.execute(icc_complete_q)).scalar_one()

        # Omics coverage: unique samples with omics results
        omics_samples_q = select(
            func.count(func.distinct(OmicsResult.sample_id))
        )
        omics_samples = (await self.db.execute(omics_samples_q)).scalar_one()

        total_samples_q = select(func.count()).where(
            Sample.is_deleted == False  # noqa: E712
        )
        total_samples = (await self.db.execute(total_samples_q)).scalar_one()

        # Omics result sets by type
        omics_by_type_q = (
            select(
                OmicsResultSet.result_type,
                func.count(OmicsResultSet.id).label("count"),
            )
            .group_by(OmicsResultSet.result_type)
        )
        omics_type_rows = (await self.db.execute(omics_by_type_q)).all()
        omics_by_type = [
            {"result_type": r[0].value if r[0] else None, "count": r[1]}
            for r in omics_type_rows
        ]

        # Sample deviation rate
        deviation_q = select(func.count()).where(
            Sample.is_deleted == False,  # noqa: E712
            Sample.has_deviation == True,  # noqa: E712
        )
        deviations = (await self.db.execute(deviation_q)).scalar_one()

        return {
            "qc": {
                "total_reviewed": qc_total,
                "passed": qc_passed,
                "pass_rate_pct": round(qc_passed / qc_total * 100, 1) if qc_total > 0 else 0,
                "by_status": qc_by_status,
            },
            "icc": {
                "total_processing": icc_total,
                "analysis_complete": icc_complete,
                "completion_rate_pct": round(icc_complete / icc_total * 100, 1) if icc_total > 0 else 0,
            },
            "omics_coverage": {
                "samples_with_results": omics_samples,
                "total_samples": total_samples,
                "coverage_pct": round(omics_samples / total_samples * 100, 1) if total_samples > 0 else 0,
                "by_type": omics_by_type,
            },
            "deviations": {
                "total_samples": total_samples,
                "with_deviations": deviations,
                "deviation_rate_pct": round(deviations / total_samples * 100, 1) if total_samples > 0 else 0,
            },
        }

    # ── Partner Imports ───────────────────────────────────────────────

    async def partner_summary(self) -> dict:
        """Import counts by partner, result totals, pending imports."""
        # Imports by partner
        by_partner_q = (
            select(
                PartnerLabImport.partner_name,
                func.count(PartnerLabImport.id).label("import_count"),
                func.sum(PartnerLabImport.records_total).label("total_records"),
                func.sum(PartnerLabImport.records_matched).label("matched_records"),
                func.sum(PartnerLabImport.records_failed).label("failed_records"),
            )
            .group_by(PartnerLabImport.partner_name)
        )
        rows = (await self.db.execute(by_partner_q)).all()
        by_partner = [
            {
                "partner_name": r[0].value if r[0] else None,
                "import_count": r[1],
                "total_records": r[2] or 0,
                "matched_records": r[3] or 0,
                "failed_records": r[4] or 0,
            }
            for r in rows
        ]

        # Total results
        total_results_q = select(func.count(PartnerLabResult.id))
        total_results = (await self.db.execute(total_results_q)).scalar_one()

        # Unmatched results
        unmatched_q = select(func.count()).where(
            PartnerLabResult.participant_id.is_(None)
        )
        unmatched = (await self.db.execute(unmatched_q)).scalar_one()

        return {
            "by_partner": by_partner,
            "total_results": total_results,
            "unmatched_results": unmatched,
        }

    # ── Combined Overview ─────────────────────────────────────────────

    async def overview(self) -> dict:
        """High-level combined dashboard for the main page.

        Returns a nested structure matching the frontend DashboardOverview
        interface with keys: enrollment, samples, storage, field_ops,
        instruments, quality.
        """
        # ── Enrollment ────────────────────────────────────────────────
        participants_q = select(func.count()).where(
            Participant.is_deleted == False  # noqa: E712
        )
        participants = (await self.db.execute(participants_q)).scalar_one()

        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        recent_enrollment_q = select(func.count()).where(
            Participant.is_deleted == False,  # noqa: E712
            Participant.enrollment_date >= thirty_days_ago,
        )
        recent_30d = (await self.db.execute(recent_enrollment_q)).scalar_one()

        # ── Samples ───────────────────────────────────────────────────
        samples_q = select(func.count()).where(
            Sample.is_deleted == False  # noqa: E712
        )
        samples = (await self.db.execute(samples_q)).scalar_one()

        stored_q = select(func.count()).where(
            Sample.is_deleted == False,  # noqa: E712
            Sample.status == SampleStatus.STORED,
        )
        stored = (await self.db.execute(stored_q)).scalar_one()

        # ── Storage utilization ───────────────────────────────────────
        total_positions_q = select(func.count(StoragePosition.id))
        total_positions = (await self.db.execute(total_positions_q)).scalar_one()

        occupied_q = select(func.count()).where(
            StoragePosition.sample_id.isnot(None)
        )
        occupied = (await self.db.execute(occupied_q)).scalar_one()

        utilization_pct = (
            round(occupied / total_positions * 100, 1)
            if total_positions > 0
            else 0.0
        )

        # ── Field ops ────────────────────────────────────────────────
        today = date.today()
        upcoming_q = select(func.count()).where(
            FieldEvent.is_deleted == False,  # noqa: E712
            FieldEvent.event_date >= today,
            FieldEvent.event_date <= today + timedelta(days=7),
        )
        upcoming = (await self.db.execute(upcoming_q)).scalar_one()

        total_checkins_q = select(func.count(FieldEventParticipant.id))
        total_checkins = (await self.db.execute(total_checkins_q)).scalar_one()

        checked_in_q = select(func.count()).where(
            FieldEventParticipant.check_in_time.isnot(None)
        )
        checked_in = (await self.db.execute(checked_in_q)).scalar_one()

        completion_rate = (
            round(checked_in / total_checkins, 3)
            if total_checkins > 0
            else 0.0
        )

        # ── Instruments ──────────────────────────────────────────────
        active_runs_q = select(func.count()).where(
            InstrumentRun.is_deleted == False,  # noqa: E712
            InstrumentRun.status == RunStatus.IN_PROGRESS,
        )
        active_runs = (await self.db.execute(active_runs_q)).scalar_one()

        # ── Quality ──────────────────────────────────────────────────
        qc_total_q = select(func.count()).where(
            InstrumentRun.is_deleted == False,  # noqa: E712
            InstrumentRun.qc_status.isnot(None),
        )
        qc_total = (await self.db.execute(qc_total_q)).scalar_one()

        qc_passed_q = select(func.count()).where(
            InstrumentRun.is_deleted == False,  # noqa: E712
            InstrumentRun.qc_status == QCStatus.PASSED,
        )
        qc_passed = (await self.db.execute(qc_passed_q)).scalar_one()

        qc_pass_rate = (
            round(qc_passed / qc_total * 100, 1)
            if qc_total > 0
            else 0.0
        )

        return {
            "enrollment": {
                "total": participants,
                "recent_30d": recent_30d,
            },
            "samples": {
                "total": samples,
                "in_storage": stored,
            },
            "storage": {
                "utilization_pct": utilization_pct,
            },
            "field_ops": {
                "upcoming_count": upcoming,
                "completion_rate": completion_rate,
            },
            "instruments": {
                "active_runs": active_runs,
            },
            "quality": {
                "qc_pass_rate": qc_pass_rate,
            },
        }
