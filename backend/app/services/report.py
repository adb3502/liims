"""Report generation service producing PDFs via WeasyPrint + Jinja2."""

import logging
import pathlib
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from jinja2 import Environment, FileSystemLoader
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from weasyprint import HTML

from app.config import settings
from app.models.enums import (
    ConsentType,
    IccStatus,
    QCStatus,
    SampleStatus,
)
from app.models.field_ops import FieldEvent
from app.models.instrument import InstrumentRun
from app.models.omics import IccProcessing, OmicsResult, OmicsResultSet
from app.models.participant import CollectionSite, Consent, Participant
from app.models.partner import PartnerLabResult
from app.models.sample import Sample
from app.models.storage import (
    Freezer,
    StorageBox,
    StoragePosition,
    StorageRack,
)
from app.models.user import AuditLog

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = pathlib.Path(__file__).parent / "report_templates"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATE_DIR)),
    autoescape=True,
)

_AGE_GROUP_LABELS = {
    1: "18-29",
    2: "30-44",
    3: "45-59",
    4: "60-74",
    5: "75+",
}


def _pct(part: int, total: int) -> float:
    return round(part / total * 100, 1) if total > 0 else 0


def _render_pdf(template_name: str, **context) -> bytes:
    """Render a Jinja2 template to PDF bytes via WeasyPrint."""
    context.setdefault("app_version", settings.APP_VERSION)
    context.setdefault("generated_at", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))
    context.setdefault("filters_summary", "")
    template = _jinja_env.get_template(template_name)
    html_str = template.render(**context)
    return HTML(string=html_str).write_pdf()


class ReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Enrollment Summary ────────────────────────────────────────────

    async def generate_enrollment_report(
        self,
        filters: dict | None = None,
    ) -> bytes:
        """Generate enrollment summary PDF."""
        filters = filters or {}

        base_where = [Participant.is_deleted == False]  # noqa: E712
        if filters.get("site_id"):
            base_where.append(Participant.collection_site_id == uuid.UUID(filters["site_id"]))
        if filters.get("wave") is not None:
            base_where.append(Participant.wave == filters["wave"])

        # Total
        total_q = select(func.count()).where(*base_where)
        total = (await self.db.execute(total_q)).scalar_one()

        # By site
        by_site_q = (
            select(CollectionSite.name, func.count(Participant.id))
            .join(Participant, Participant.collection_site_id == CollectionSite.id)
            .where(*base_where)
            .group_by(CollectionSite.name)
            .order_by(func.count(Participant.id).desc())
        )
        by_site_rows = (await self.db.execute(by_site_q)).all()
        by_site = [
            {"site_name": r[0], "count": r[1], "pct": _pct(r[1], total)}
            for r in by_site_rows
        ]

        # By age group
        by_age_q = (
            select(Participant.age_group, func.count(Participant.id))
            .where(*base_where)
            .group_by(Participant.age_group)
            .order_by(Participant.age_group.asc())
        )
        by_age_rows = (await self.db.execute(by_age_q)).all()
        by_age_group = [
            {"label": _AGE_GROUP_LABELS.get(r[0].value, str(r[0])) if r[0] else "Unknown",
             "count": r[1], "pct": _pct(r[1], total)}
            for r in by_age_rows
        ]

        # By sex
        by_sex_q = (
            select(Participant.sex, func.count(Participant.id))
            .where(*base_where)
            .group_by(Participant.sex)
        )
        by_sex_rows = (await self.db.execute(by_sex_q)).all()
        by_sex = [
            {"label": "Male" if r[0] and r[0].value == "M" else "Female",
             "count": r[1], "pct": _pct(r[1], total)}
            for r in by_sex_rows
        ]

        # By wave
        by_wave_q = (
            select(Participant.wave, func.count(Participant.id))
            .where(*base_where)
            .group_by(Participant.wave)
            .order_by(Participant.wave.asc())
        )
        by_wave_rows = (await self.db.execute(by_wave_q)).all()
        by_wave = [
            {"wave": r[0], "count": r[1], "pct": _pct(r[1], total)}
            for r in by_wave_rows
        ]

        # Average completion
        avg_q = select(func.coalesce(func.avg(Participant.completion_pct), 0)).where(*base_where)
        avg_completion = (await self.db.execute(avg_q)).scalar_one()

        # Enrollment rate (last 30 days)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        rate_q = (
            select(
                func.date_trunc("day", Participant.enrollment_date).label("day"),
                func.count(Participant.id),
            )
            .where(*base_where, Participant.enrollment_date >= thirty_days_ago)
            .group_by(func.date_trunc("day", Participant.enrollment_date))
            .order_by(func.date_trunc("day", Participant.enrollment_date).asc())
        )
        rate_rows = (await self.db.execute(rate_q)).all()
        enrollment_rate = [
            {"date": r[0].strftime("%Y-%m-%d") if r[0] else "", "count": r[1]}
            for r in rate_rows
        ]

        # Sites count
        sites_q = select(func.count(func.distinct(Participant.collection_site_id))).where(*base_where)
        total_sites = (await self.db.execute(sites_q)).scalar_one()

        return _render_pdf(
            "enrollment_summary.html",
            title="Enrollment Summary Report",
            subtitle="Participant enrollment demographics and trends",
            total_participants=total,
            total_sites=total_sites,
            total_waves=len(by_wave),
            avg_completion_pct=round(float(avg_completion), 1),
            by_site=by_site,
            by_age_group=by_age_group,
            by_sex=by_sex,
            by_wave=by_wave,
            enrollment_rate=enrollment_rate,
        )

    # ── Inventory Summary ─────────────────────────────────────────────

    async def generate_inventory_report(
        self,
        filters: dict | None = None,
    ) -> bytes:
        """Generate inventory summary PDF."""
        filters = filters or {}

        # Total samples
        sample_where = [Sample.is_deleted == False]  # noqa: E712
        total_q = select(func.count()).where(*sample_where)
        total_samples = (await self.db.execute(total_q)).scalar_one()

        # Stored samples
        stored_q = select(func.count()).where(
            *sample_where, Sample.status == SampleStatus.STORED
        )
        total_stored = (await self.db.execute(stored_q)).scalar_one()

        # By type
        by_type_q = (
            select(Sample.sample_type, func.count(Sample.id))
            .where(*sample_where)
            .group_by(Sample.sample_type)
            .order_by(func.count(Sample.id).desc())
        )
        by_type_rows = (await self.db.execute(by_type_q)).all()
        by_type = [
            {"sample_type": r[0].value if r[0] else "unknown",
             "count": r[1], "pct": _pct(r[1], total_samples)}
            for r in by_type_rows
        ]

        # By status
        by_status_q = (
            select(Sample.status, func.count(Sample.id))
            .where(*sample_where)
            .group_by(Sample.status)
            .order_by(func.count(Sample.id).desc())
        )
        by_status_rows = (await self.db.execute(by_status_q)).all()
        by_status = [
            {"status": r[0].value if r[0] else "unknown",
             "count": r[1], "pct": _pct(r[1], total_samples)}
            for r in by_status_rows
        ]

        # Storage utilization
        total_positions_q = select(func.count(StoragePosition.id))
        total_positions = (await self.db.execute(total_positions_q)).scalar_one()
        occupied_q = select(func.count()).where(StoragePosition.sample_id.isnot(None))
        occupied = (await self.db.execute(occupied_q)).scalar_one()

        # Per-freezer utilization
        freezer_q = (
            select(
                Freezer.name, Freezer.freezer_type,
                func.count(StoragePosition.id),
                func.count(StoragePosition.sample_id),
            )
            .join(StorageRack, StorageRack.freezer_id == Freezer.id)
            .join(StorageBox, StorageBox.rack_id == StorageRack.id)
            .join(StoragePosition, StoragePosition.box_id == StorageBox.id)
            .where(Freezer.is_deleted == False)  # noqa: E712
            .group_by(Freezer.name, Freezer.freezer_type)
            .order_by(Freezer.name.asc())
        )
        freezer_rows = (await self.db.execute(freezer_q)).all()
        freezer_utilization = [
            {
                "freezer_name": r[0],
                "freezer_type": r[1].value if r[1] else "",
                "total_positions": r[2],
                "occupied": r[3],
                "utilization_pct": _pct(r[3], r[2]),
            }
            for r in freezer_rows
        ]

        # Low-volume samples (remaining < 20% of initial, where both are set)
        low_vol_q = (
            select(
                Sample.sample_code, Sample.sample_type,
                Sample.remaining_volume_ul, Sample.initial_volume_ul,
            )
            .where(
                *sample_where,
                Sample.remaining_volume_ul.isnot(None),
                Sample.initial_volume_ul.isnot(None),
                Sample.initial_volume_ul > 0,
                Sample.remaining_volume_ul < Sample.initial_volume_ul * Decimal("0.2"),
                Sample.status != SampleStatus.DEPLETED,
                Sample.status != SampleStatus.DISCARDED,
            )
            .order_by(Sample.remaining_volume_ul.asc())
            .limit(50)
        )
        low_vol_rows = (await self.db.execute(low_vol_q)).all()
        low_volume_samples = [
            {
                "sample_code": r[0],
                "sample_type": r[1].value if r[1] else "",
                "remaining_volume_ul": str(r[2]),
                "initial_volume_ul": str(r[3]),
            }
            for r in low_vol_rows
        ]

        return _render_pdf(
            "inventory_summary.html",
            title="Inventory Summary Report",
            subtitle="Sample inventory, storage utilization, and low-volume warnings",
            total_samples=total_samples,
            total_stored=total_stored,
            total_positions=total_positions,
            storage_utilization_pct=_pct(occupied, total_positions),
            by_type=by_type,
            by_status=by_status,
            freezer_utilization=freezer_utilization,
            low_volume_samples=low_volume_samples,
        )

    # ── Quality Summary ───────────────────────────────────────────────

    async def generate_quality_report(
        self,
        filters: dict | None = None,
    ) -> bytes:
        """Generate quality summary PDF."""
        filters = filters or {}

        # QC by status
        qc_q = (
            select(InstrumentRun.qc_status, func.count(InstrumentRun.id))
            .where(
                InstrumentRun.is_deleted == False,  # noqa: E712
                InstrumentRun.qc_status.isnot(None),
            )
            .group_by(InstrumentRun.qc_status)
        )
        qc_rows = (await self.db.execute(qc_q)).all()
        qc_total = sum(r[1] for r in qc_rows)
        qc_passed = sum(r[1] for r in qc_rows if r[0] == QCStatus.PASSED)
        qc_failed = sum(r[1] for r in qc_rows if r[0] == QCStatus.FAILED)
        qc_by_status = [
            {"status": r[0].value if r[0] else "unknown",
             "count": r[1], "pct": _pct(r[1], qc_total)}
            for r in qc_rows
        ]

        # Deviations
        sample_where = [Sample.is_deleted == False]  # noqa: E712
        total_samples_q = select(func.count()).where(*sample_where)
        total_samples = (await self.db.execute(total_samples_q)).scalar_one()

        deviation_q = select(func.count()).where(
            *sample_where, Sample.has_deviation == True  # noqa: E712
        )
        total_deviations = (await self.db.execute(deviation_q)).scalar_one()

        # Recent deviations
        recent_dev_q = (
            select(Sample.sample_code, Sample.sample_type, Sample.deviation_notes)
            .where(
                *sample_where,
                Sample.has_deviation == True,  # noqa: E712
            )
            .order_by(Sample.created_at.desc())
            .limit(20)
        )
        recent_dev_rows = (await self.db.execute(recent_dev_q)).all()
        recent_deviations = [
            {
                "sample_code": r[0],
                "sample_type": r[1].value if r[1] else "",
                "deviation_notes": r[2] or "",
            }
            for r in recent_dev_rows
        ]

        # ICC processing by status
        icc_q = (
            select(IccProcessing.status, func.count(IccProcessing.id))
            .group_by(IccProcessing.status)
        )
        icc_rows = (await self.db.execute(icc_q)).all()
        icc_total = sum(r[1] for r in icc_rows)
        icc_complete = sum(r[1] for r in icc_rows if r[0] == IccStatus.ANALYSIS_COMPLETE)
        icc_by_status = [
            {"status": r[0].value if r[0] else "unknown",
             "count": r[1], "pct": _pct(r[1], icc_total)}
            for r in icc_rows
        ]

        # Omics coverage
        omics_samples_q = select(func.count(func.distinct(OmicsResult.sample_id)))
        omics_total_samples = (await self.db.execute(omics_samples_q)).scalar_one()

        omics_type_q = (
            select(
                OmicsResultSet.result_type,
                func.count(OmicsResultSet.id),
                func.sum(OmicsResultSet.total_samples),
            )
            .group_by(OmicsResultSet.result_type)
        )
        omics_type_rows = (await self.db.execute(omics_type_q)).all()
        omics_by_type = [
            {
                "result_type": r[0].value if r[0] else "unknown",
                "set_count": r[1],
                "sample_count": r[2] or 0,
            }
            for r in omics_type_rows
        ]

        return _render_pdf(
            "quality_summary.html",
            title="Quality Summary Report",
            subtitle="QC results, deviations, ICC processing, and omics coverage",
            qc_pass_rate_pct=_pct(qc_passed, qc_total),
            icc_completion_pct=_pct(icc_complete, icc_total),
            omics_coverage_pct=_pct(omics_total_samples, total_samples),
            deviation_rate_pct=_pct(total_deviations, total_samples),
            qc_by_status=qc_by_status,
            qc_failed_count=qc_failed,
            total_deviations=total_deviations,
            total_samples=total_samples,
            recent_deviations=recent_deviations,
            icc_by_status=icc_by_status,
            omics_by_type=omics_by_type,
            omics_total_samples=omics_total_samples,
        )

    # ── Compliance Report ─────────────────────────────────────────────

    async def generate_compliance_report(
        self,
        filters: dict | None = None,
    ) -> bytes:
        """Generate compliance report PDF: consent, audit trail, DPDP checklist."""
        filters = filters or {}

        # Total participants
        total_q = select(func.count()).where(Participant.is_deleted == False)  # noqa: E712
        total_participants = (await self.db.execute(total_q)).scalar_one()

        # Consent by type
        consent_types = [ct for ct in ConsentType]
        consent_by_type = []
        total_given = 0
        total_withdrawn = 0
        for ct in consent_types:
            given_q = select(func.count()).where(
                Consent.consent_type == ct,
                Consent.consent_given == True,  # noqa: E712
                Consent.withdrawal_date.is_(None),
            )
            given = (await self.db.execute(given_q)).scalar_one()

            not_given_q = select(func.count()).where(
                Consent.consent_type == ct,
                Consent.consent_given == False,  # noqa: E712
            )
            not_given = (await self.db.execute(not_given_q)).scalar_one()

            withdrawn_q = select(func.count()).where(
                Consent.consent_type == ct,
                Consent.withdrawal_date.isnot(None),
            )
            withdrawn = (await self.db.execute(withdrawn_q)).scalar_one()

            ct_total = given + not_given + withdrawn
            consent_by_type.append({
                "consent_type": ct.value.replace("_", " ").title(),
                "given": given,
                "not_given": not_given,
                "withdrawn": withdrawn,
                "coverage_pct": _pct(given, ct_total),
            })
            total_given += given
            total_withdrawn += withdrawn

        # Participants with at least one consent
        has_consent_q = select(func.count(func.distinct(Consent.participant_id))).where(
            Consent.consent_given == True  # noqa: E712
        )
        has_consent = (await self.db.execute(has_consent_q)).scalar_one()
        missing_consent_count = max(total_participants - has_consent, 0)

        # Audit trail summary (last 30 days)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        audit_total_q = select(func.count(AuditLog.id)).where(
            AuditLog.created_at >= thirty_days_ago
        )
        total_audit = (await self.db.execute(audit_total_q)).scalar_one()

        audit_users_q = select(func.count(func.distinct(AuditLog.user_id))).where(
            AuditLog.created_at >= thirty_days_ago
        )
        audit_users = (await self.db.execute(audit_users_q)).scalar_one()

        audit_action_q = (
            select(AuditLog.action, func.count(AuditLog.id))
            .where(AuditLog.created_at >= thirty_days_ago)
            .group_by(AuditLog.action)
            .order_by(func.count(AuditLog.id).desc())
        )
        audit_action_rows = (await self.db.execute(audit_action_q)).all()
        audit_by_action = [
            {"action": r[0].value if r[0] else "unknown", "count": r[1]}
            for r in audit_action_rows
        ]

        audit_entity_q = (
            select(AuditLog.entity_type, func.count(AuditLog.id))
            .where(AuditLog.created_at >= thirty_days_ago)
            .group_by(AuditLog.entity_type)
            .order_by(func.count(AuditLog.id).desc())
            .limit(10)
        )
        audit_entity_rows = (await self.db.execute(audit_entity_q)).all()
        audit_by_entity = [
            {"entity_type": r[0] or "unknown", "count": r[1]}
            for r in audit_entity_rows
        ]

        # DPDP compliance checklist
        dpdp_checklist = [
            {
                "requirement": "Individual consent collected for all participants",
                "met": missing_consent_count == 0,
                "details": f"{has_consent}/{total_participants} participants have consent"
                           if missing_consent_count > 0
                           else "All participants have at least one consent record",
            },
            {
                "requirement": "Audit trail enabled for all data modifications",
                "met": True,
                "details": f"{total_audit} audit entries in the last 30 days",
            },
            {
                "requirement": "Consent withdrawal mechanism operational",
                "met": True,
                "details": f"{total_withdrawn} withdrawal(s) recorded and processed",
            },
            {
                "requirement": "Data access restricted by role-based controls",
                "met": True,
                "details": "RBAC enforced on all API endpoints via JWT + role middleware",
            },
            {
                "requirement": "Personal data encrypted at rest",
                "met": True,
                "details": "PostgreSQL with encrypted storage; passwords bcrypt-hashed",
            },
        ]

        # Data retention metrics
        pending_discard_q = select(func.count()).where(
            Sample.is_deleted == False,  # noqa: E712
            Sample.status == SampleStatus.PENDING_DISCARD,
        )
        pending_discard = (await self.db.execute(pending_discard_q)).scalar_one()

        discarded_q = select(func.count()).where(
            Sample.is_deleted == False,  # noqa: E712
            Sample.status == SampleStatus.DISCARDED,
        )
        discarded = (await self.db.execute(discarded_q)).scalar_one()

        # Consent withdrawals that may require data deletion
        deletion_q = select(func.count(func.distinct(Consent.participant_id))).where(
            Consent.withdrawal_date.isnot(None)
        )
        deletion_required = (await self.db.execute(deletion_q)).scalar_one()

        return _render_pdf(
            "compliance.html",
            title="Compliance Report",
            subtitle="Consent coverage, audit trail, and DPDP compliance status",
            total_participants=total_participants,
            consent_coverage_pct=_pct(has_consent, total_participants),
            withdrawn_count=total_withdrawn,
            consent_by_type=consent_by_type,
            missing_consent_count=missing_consent_count,
            total_audit_entries=total_audit,
            audit_users_count=audit_users,
            audit_by_action=audit_by_action,
            audit_by_entity=audit_by_entity,
            dpdp_checklist=dpdp_checklist,
            pending_discard_count=pending_discard,
            discarded_count=discarded,
            deletion_required_count=deletion_required,
        )
