"""Dashboard analytics service with computed statistics."""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import (
    IccStatus,
    OmicsResultType,
    QCStatus,
    RunStatus,
    SampleStatus,
)
from app.models.field_ops import FieldEvent, FieldEventParticipant
from app.models.instrument import InstrumentRun
from app.models.omics import IccProcessing, OmicsResult, OmicsResultSet
from app.models.participant import CollectionSite, Participant
from app.models.partner import CanonicalTest, PartnerLabImport, PartnerLabResult
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
        day_expr = func.date_trunc("day", Participant.enrollment_date)
        rate_q = (
            select(
                day_expr.label("day"),
                func.count(Participant.id).label("count"),
            )
            .where(
                Participant.is_deleted == False,  # noqa: E712
                Participant.enrollment_date >= thirty_days_ago,
            )
            .group_by(day_expr)
            .order_by(day_expr.asc())
        )
        rate_rows = (await self.db.execute(rate_q)).all()
        enrollment_rate = [
            {"date": r[0].isoformat() if r[0] else None, "count": r[1]}
            for r in rate_rows
        ]

        # Demographics: by age group
        by_age_q = (
            select(
                Participant.age_group,
                func.count(Participant.id).label("count"),
            )
            .where(Participant.is_deleted == False)  # noqa: E712
            .group_by(Participant.age_group)
            .order_by(Participant.age_group.asc())
        )
        by_age_rows = (await self.db.execute(by_age_q)).all()
        by_age_group = [
            {"age_group": str(r[0].value if hasattr(r[0], 'value') else r[0]), "count": r[1]}
            for r in by_age_rows
        ]

        # Demographics: by sex
        by_sex_q = (
            select(
                Participant.sex,
                func.count(Participant.id).label("count"),
            )
            .where(Participant.is_deleted == False)  # noqa: E712
            .group_by(Participant.sex)
        )
        by_sex_rows = (await self.db.execute(by_sex_q)).all()
        by_sex = [
            {"sex": str(r[0].value if hasattr(r[0], 'value') else r[0]), "count": r[1]}
            for r in by_sex_rows
        ]

        # Demographics: by age group × sex cross-tab
        by_age_sex_q = (
            select(
                Participant.age_group,
                Participant.sex,
                func.count(Participant.id).label("count"),
            )
            .where(Participant.is_deleted == False)  # noqa: E712
            .group_by(Participant.age_group, Participant.sex)
            .order_by(Participant.age_group.asc(), Participant.sex.asc())
        )
        by_age_sex_rows = (await self.db.execute(by_age_sex_q)).all()
        by_age_sex = [
            {
                "age_group": str(r[0].value if hasattr(r[0], 'value') else r[0]),
                "sex": str(r[1].value if hasattr(r[1], 'value') else r[1]),
                "count": r[2],
            }
            for r in by_age_sex_rows
        ]

        # Recent 30 days count
        recent_30d_q = select(func.count()).where(
            Participant.is_deleted == False,  # noqa: E712
            Participant.enrollment_date >= thirty_days_ago,
        )
        recent_30d = (await self.db.execute(recent_30d_q)).scalar_one()

        # Enrollment over ALL time (monthly, not just 30 days)
        month_expr = func.date_trunc("month", Participant.enrollment_date)
        all_time_q = (
            select(
                month_expr.label("month"),
                func.count(Participant.id).label("count"),
            )
            .where(Participant.is_deleted == False)  # noqa: E712
            .group_by(month_expr)
            .order_by(month_expr.asc())
        )
        all_time_rows = (await self.db.execute(all_time_q)).all()
        enrollment_over_time = [
            {"date": r[0].isoformat() if r[0] else None, "count": r[1]}
            for r in all_time_rows
        ]

        # Urban vs Rural: derive from site code
        # BBH, RMH, CHAF, BMC = urban; SSSSMH = rural
        urban_sites = {"BBH", "RMH", "CHAF", "BMC", "JSS"}
        rural_sites = {"SSSSMH"}
        urban_count = sum(s["count"] for s in by_site if s["site_code"] in urban_sites)
        rural_count = sum(s["count"] for s in by_site if s["site_code"] in rural_sites)

        # HbA1c classification from lab results
        # Normal: <5.7%, Prediabetic: 5.7-6.4%, Diabetic: >=6.5%
        hba1c_q = await self.db.execute(select(
            PartnerLabResult.test_value,
            Participant.id,
        ).join(
            Participant, PartnerLabResult.participant_id == Participant.id
        ).join(
            CanonicalTest, PartnerLabResult.canonical_test_id == CanonicalTest.id
        ).where(
            CanonicalTest.canonical_name == "hba1c",
            Participant.is_deleted == False,  # noqa: E712
            PartnerLabResult.test_value.isnot(None),
        ))
        hba1c_normal = 0
        hba1c_prediabetic = 0
        hba1c_diabetic = 0
        hba1c_values = []  # for distribution
        seen_participants = set()
        for row in hba1c_q.all():
            try:
                val = float(row[0])
                pid = row[1]
                if pid in seen_participants:
                    continue
                seen_participants.add(pid)
                hba1c_values.append(val)
                if val < 5.7:
                    hba1c_normal += 1
                elif val < 6.5:
                    hba1c_prediabetic += 1
                else:
                    hba1c_diabetic += 1
            except (ValueError, TypeError):
                pass

        # Continuous age distribution from clinical_data
        age_values = []
        age_q = await self.db.execute(
            select(Participant.clinical_data["demographics"]["age"].as_string())
            .where(
                Participant.is_deleted == False,  # noqa: E712
                Participant.clinical_data.isnot(None),
            )
        )
        for row in age_q.scalars().all():
            try:
                age = float(row)
                if 0 < age < 120:
                    age_values.append(age)
            except (ValueError, TypeError):
                pass

        return {
            "total_participants": total,
            "by_site": by_site,
            "by_wave": by_wave,
            "enrollment_rate_30d": enrollment_rate,
            "enrollment_over_time": enrollment_over_time,
            "recent_30d": recent_30d,
            "demographics": {
                "by_age_group": by_age_group,
                "by_sex": by_sex,
                "by_age_sex": by_age_sex,
                "urban_rural": {"urban": urban_count, "rural": rural_count},
                "hba1c_status": {
                    "normal": hba1c_normal,
                    "prediabetic": hba1c_prediabetic,
                    "diabetic": hba1c_diabetic,
                },
                "age_distribution": age_values,
                "hba1c_distribution": hba1c_values,
            },
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
        """QC pass/fail rates, ICC completion rates, omics coverage.

        Shape matches frontend QualityDashboard interface:
          qc_pass_fail: {passed, failed, pending}
          icc_completion: [{status, count}, ...]
          omics_coverage: {total_participants, proteomics_count, metabolomics_count}
        """
        # QC pass/fail/pending on instrument runs
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
        qc_pass_fail = {
            "passed": qc_by_status.get(QCStatus.PASSED.value, 0),
            "failed": qc_by_status.get(QCStatus.FAILED.value, 0),
            "pending": qc_by_status.get(QCStatus.PENDING.value, 0),
        }

        # ICC completion — GROUP BY status for per-status array
        icc_by_status_q = (
            select(
                IccProcessing.status,
                func.count(IccProcessing.id).label("count"),
            )
            .group_by(IccProcessing.status)
            .order_by(IccProcessing.status)
        )
        icc_rows = (await self.db.execute(icc_by_status_q)).all()
        icc_completion = [
            {"status": r[0].value if r[0] else "unknown", "count": r[1]}
            for r in icc_rows
        ]

        # Omics coverage: unique participants with proteomics / metabolomics
        # Count distinct participants via sample → omics_result join
        total_participants_q = select(func.count()).where(
            Participant.is_deleted == False  # noqa: E712
        )
        total_participants = (await self.db.execute(total_participants_q)).scalar_one()

        proteomics_q = (
            select(func.count(func.distinct(Participant.id)))
            .join(Sample, Sample.participant_id == Participant.id)
            .join(OmicsResult, OmicsResult.sample_id == Sample.id)
            .join(OmicsResultSet, OmicsResultSet.id == OmicsResult.result_set_id)
            .where(
                Participant.is_deleted == False,  # noqa: E712
                OmicsResultSet.result_type == OmicsResultType.PROTEOMICS,
            )
        )
        proteomics_count = (await self.db.execute(proteomics_q)).scalar_one()

        metabolomics_q = (
            select(func.count(func.distinct(Participant.id)))
            .join(Sample, Sample.participant_id == Participant.id)
            .join(OmicsResult, OmicsResult.sample_id == Sample.id)
            .join(OmicsResultSet, OmicsResultSet.id == OmicsResult.result_set_id)
            .where(
                Participant.is_deleted == False,  # noqa: E712
                OmicsResultSet.result_type == OmicsResultType.METABOLOMICS,
            )
        )
        metabolomics_count = (await self.db.execute(metabolomics_q)).scalar_one()

        return {
            "qc_pass_fail": qc_pass_fail,
            "icc_completion": icc_completion,
            "omics_coverage": {
                "total_participants": total_participants,
                "proteomics_count": proteomics_count,
                "metabolomics_count": metabolomics_count,
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

    # ── Enrollment Matrix ─────────────────────────────────────────────

    # Per-site targets: target count PER GROUP CODE (per category).
    # Baptist has 200 slots per group code, others have 100 per group code.
    _SITE_TARGETS: dict[str, int] = {
        "RMH": 100,     # 100 per category (e.g., 100 males aged 18-29)
        "SSSSMH": 100,  # 100 per category
        "BBH": 200,     # 200 per category (largest site)
        "CHAF": 100,    # 100 per category
        "BMC": 0,       # not active yet
        "JSS": 0,       # not active yet
    }
    _GROUP_CODES = [
        "1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B",
    ]

    async def enrollment_matrix(self) -> dict:
        """Enrollment counts grouped by collection site × group_code.

        Returns:
          sites: [{code, name}]
          group_codes: ["1A","1B",...,"5A","5B"]
          matrix: {site_code: {group_code: {count, target}}}
          totals: {by_site: {site_code: int}, by_group: {group_code: int}}
        """
        # Fetch all active sites
        sites_q = (
            select(CollectionSite.code, CollectionSite.name)
            .order_by(CollectionSite.code.asc())
        )
        site_rows = (await self.db.execute(sites_q)).all()
        sites = [{"code": r[0], "name": r[1]} for r in site_rows]

        # Enrollment counts: GROUP BY site_code, group_code
        counts_q = (
            select(
                CollectionSite.code.label("site_code"),
                Participant.group_code,
                func.count(Participant.id).label("count"),
            )
            .join(CollectionSite, Participant.collection_site_id == CollectionSite.id)
            .where(Participant.is_deleted == False)  # noqa: E712
            .group_by(CollectionSite.code, Participant.group_code)
        )
        count_rows = (await self.db.execute(counts_q)).all()

        # Build matrix with zeros as defaults
        matrix: dict[str, dict[str, dict]] = {}
        for site in sites:
            site_code = site["code"]
            target_per_cell = self._SITE_TARGETS.get(site_code, 0)
            matrix[site_code] = {
                gc: {"count": 0, "target": target_per_cell}
                for gc in self._GROUP_CODES
            }

        for row in count_rows:
            site_code = row.site_code
            gc = row.group_code
            if site_code not in matrix:
                # Unexpected site: initialise on the fly
                matrix[site_code] = {
                    gc2: {"count": 0, "target": 0} for gc2 in self._GROUP_CODES
                }
            if gc in matrix[site_code]:
                matrix[site_code][gc]["count"] = row.count
            else:
                matrix[site_code][gc] = {"count": row.count, "target": self._SITE_TARGETS.get(site_code, 0)}

        # Fill in targets for cells with zero count (so every cell has a target)
        for site_code in matrix:
            target = self._SITE_TARGETS.get(site_code, 0)
            for gc in self._GROUP_CODES:
                if gc not in matrix[site_code]:
                    matrix[site_code][gc] = {"count": 0, "target": target}
                elif matrix[site_code][gc]["target"] == 0:
                    matrix[site_code][gc]["target"] = target

        # Compute totals as {count, target} objects (not plain ints)
        by_site: dict[str, dict] = {}
        for s in sites:
            sc = s["code"]
            site_count = sum(cell["count"] for cell in matrix.get(sc, {}).values())
            site_target = self._SITE_TARGETS.get(sc, 0) * len(self._GROUP_CODES)
            by_site[sc] = {"count": site_count, "target": site_target}

        by_group: dict[str, dict] = {}
        for gc in self._GROUP_CODES:
            gc_count = sum(matrix.get(sc, {}).get(gc, {}).get("count", 0) for sc in [s["code"] for s in sites])
            gc_target = sum(self._SITE_TARGETS.get(sc, 0) for sc in [s["code"] for s in sites])
            by_group[gc] = {"count": gc_count, "target": gc_target}

        grand_count = sum(v["count"] for v in by_site.values())
        grand_target = sum(v["target"] for v in by_site.values())

        return {
            "sites": sites,
            "group_codes": self._GROUP_CODES,
            "matrix": matrix,
            "totals": {
                "by_site": by_site,
                "by_group": by_group,
                "grand": {"count": grand_count, "target": grand_target},
            },
        }
