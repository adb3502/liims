"""Services for ODK integration, partner lab imports, canonical tests, stool kits."""

import csv
import io
import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import (
    AuditAction,
    MatchStatus,
    OdkSyncStatus,
    PartnerName,
    StoolKitStatus,
)
from app.models.partner import (
    CanonicalTest,
    OdkFormConfig,
    OdkSubmission,
    OdkSyncLog,
    PartnerLabImport,
    PartnerLabResult,
    StoolKit,
    TestNameAlias,
)
from app.models.participant import Participant
from app.models.user import AuditLog
from app.schemas.partner import (
    CanonicalTestCreate,
    CanonicalTestUpdate,
    ImportConfigureRequest,
    ImportPreviewResponse,
    ImportPreviewRow,
    OdkFormConfigCreate,
    OdkFormConfigUpdate,
    StoolKitCreate,
    StoolKitUpdate,
    TestNameAliasCreate,
)

logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "liims_imports")


# ---------------------------------------------------------------------------
# ODK Service
# ---------------------------------------------------------------------------


class OdkService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_form_configs(self) -> list[OdkFormConfig]:
        result = await self.db.execute(
            select(OdkFormConfig).order_by(OdkFormConfig.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_form_config(
        self, data: OdkFormConfigCreate, created_by: uuid.UUID
    ) -> OdkFormConfig:
        config = OdkFormConfig(
            id=uuid.uuid4(),
            form_id=data.form_id,
            form_name=data.form_name,
            form_version=data.form_version,
            field_mapping=data.field_mapping,
            updated_by=created_by,
        )
        self.db.add(config)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="odk_form_config",
            entity_id=config.id,
            new_values={"form_id": config.form_id, "form_name": config.form_name},
        ))
        return config

    async def update_form_config(
        self,
        config_id: uuid.UUID,
        data: OdkFormConfigUpdate,
        updated_by: uuid.UUID,
    ) -> OdkFormConfig | None:
        result = await self.db.execute(
            select(OdkFormConfig).where(OdkFormConfig.id == config_id)
        )
        config = result.scalar_one_or_none()
        if config is None:
            return None

        old_values = {}
        new_values = {}
        for field, value in data.model_dump(exclude_unset=True).items():
            current = getattr(config, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(config, field, value)
                new_values[field] = str(value) if value is not None else None

        config.updated_by = updated_by

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="odk_form_config",
                entity_id=config.id,
                old_values=old_values,
                new_values=new_values,
            ))
        return config

    async def trigger_sync(
        self, form_id: str | None, triggered_by: uuid.UUID
    ) -> OdkSyncLog:
        """Trigger an ODK sync.

        TODO: Integrate with real ODK Central API. Currently creates a
        completed log entry as a placeholder for the sync workflow.
        """
        now = datetime.now(timezone.utc)
        log = OdkSyncLog(
            id=uuid.uuid4(),
            sync_started_at=now,
            sync_completed_at=now,
            status=OdkSyncStatus.COMPLETED,
            submissions_found=0,
            submissions_processed=0,
            submissions_failed=0,
            created_by=triggered_by,
        )
        self.db.add(log)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=triggered_by,
            action=AuditAction.CREATE,
            entity_type="odk_sync_log",
            entity_id=log.id,
            new_values={"form_id": form_id or "all", "status": log.status.value},
        ))
        return log

    async def list_sync_logs(
        self, page: int = 1, per_page: int = 20
    ) -> tuple[list[OdkSyncLog], int]:
        query = select(OdkSyncLog).order_by(OdkSyncLog.sync_started_at.desc())
        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def list_submissions(
        self,
        form_id: str | None = None,
        status: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[OdkSubmission], int]:
        query = select(OdkSubmission).order_by(OdkSubmission.created_at.desc())
        if form_id:
            query = query.where(OdkSubmission.odk_form_id == form_id)
        if status:
            query = query.where(OdkSubmission.processing_status == status)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total


# ---------------------------------------------------------------------------
# Canonical Test Service
# ---------------------------------------------------------------------------


class CanonicalTestService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_test(
        self, data: CanonicalTestCreate, created_by: uuid.UUID
    ) -> CanonicalTest:
        test = CanonicalTest(
            id=uuid.uuid4(),
            canonical_name=data.canonical_name,
            display_name=data.display_name,
            category=data.category,
            standard_unit=data.standard_unit,
            reference_range_low=data.reference_range_low,
            reference_range_high=data.reference_range_high,
            updated_by=created_by,
        )
        self.db.add(test)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="canonical_test",
            entity_id=test.id,
            new_values={"canonical_name": test.canonical_name},
        ))
        return test

    async def list_tests(
        self,
        category: str | None = None,
        search: str | None = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[list[CanonicalTest], int]:
        query = select(CanonicalTest).options(selectinload(CanonicalTest.aliases))

        if search:
            query = query.where(
                text("similarity(canonical_test.canonical_name, :search) > 0.1")
            ).params(search=search)
            query = query.order_by(
                text("similarity(canonical_test.canonical_name, :search) DESC")
            ).params(search=search)
        else:
            query = query.order_by(CanonicalTest.canonical_name.asc())

        if category:
            query = query.where(CanonicalTest.category == category)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def update_test(
        self,
        test_id: uuid.UUID,
        data: CanonicalTestUpdate,
        updated_by: uuid.UUID,
    ) -> CanonicalTest | None:
        result = await self.db.execute(
            select(CanonicalTest).where(CanonicalTest.id == test_id)
        )
        test = result.scalar_one_or_none()
        if test is None:
            return None

        old_values = {}
        new_values = {}
        for field, value in data.model_dump(exclude_unset=True).items():
            current = getattr(test, field)
            if value != current:
                old_values[field] = str(current) if current is not None else None
                setattr(test, field, value)
                new_values[field] = str(value) if value is not None else None

        test.updated_by = updated_by

        if new_values:
            self.db.add(AuditLog(
                id=uuid.uuid4(),
                user_id=updated_by,
                action=AuditAction.UPDATE,
                entity_type="canonical_test",
                entity_id=test.id,
                old_values=old_values,
                new_values=new_values,
            ))
        return test

    async def add_alias(
        self,
        test_id: uuid.UUID,
        data: TestNameAliasCreate,
        created_by: uuid.UUID,
    ) -> TestNameAlias:
        alias = TestNameAlias(
            id=uuid.uuid4(),
            canonical_test_id=test_id,
            partner_name=data.partner_name,
            alias_name=data.alias_name,
            alias_unit=data.alias_unit,
            unit_conversion_factor=data.unit_conversion_factor,
        )
        self.db.add(alias)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=created_by,
            action=AuditAction.CREATE,
            entity_type="test_name_alias",
            entity_id=alias.id,
            new_values={
                "canonical_test_id": str(test_id),
                "alias_name": alias.alias_name,
                "partner_name": alias.partner_name.value,
            },
        ))
        return alias

    async def list_aliases(self, test_id: uuid.UUID) -> list[TestNameAlias]:
        result = await self.db.execute(
            select(TestNameAlias)
            .where(TestNameAlias.canonical_test_id == test_id)
            .order_by(TestNameAlias.alias_name.asc())
        )
        return list(result.scalars().all())

    async def delete_alias(
        self, alias_id: uuid.UUID, deleted_by: uuid.UUID
    ) -> bool:
        result = await self.db.execute(
            select(TestNameAlias).where(TestNameAlias.id == alias_id)
        )
        alias = result.scalar_one_or_none()
        if alias is None:
            return False

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=deleted_by,
            action=AuditAction.DELETE,
            entity_type="test_name_alias",
            entity_id=alias.id,
            old_values={
                "alias_name": alias.alias_name,
                "partner_name": alias.partner_name.value,
            },
        ))
        await self.db.delete(alias)
        return True


# ---------------------------------------------------------------------------
# Partner Import Service
# ---------------------------------------------------------------------------


class PartnerImportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def upload_csv(
        self,
        file_content: bytes,
        file_name: str,
        partner_name: PartnerName,
        uploaded_by: uuid.UUID,
    ) -> PartnerLabImport:
        """Store uploaded CSV and create an import record."""
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        import_id = uuid.uuid4()
        safe_name = f"{import_id}_{file_name}"
        file_path = os.path.join(UPLOAD_DIR, safe_name)

        with open(file_path, "wb") as f:
            f.write(file_content)

        # Count rows to populate records_total
        text_content = file_content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text_content))
        row_count = sum(1 for _ in reader)

        record = PartnerLabImport(
            id=import_id,
            partner_name=partner_name,
            import_date=datetime.now(timezone.utc),
            source_file_name=file_name,
            source_file_path=file_path,
            records_total=row_count,
            imported_by=uploaded_by,
        )
        self.db.add(record)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=uploaded_by,
            action=AuditAction.CREATE,
            entity_type="partner_lab_import",
            entity_id=record.id,
            new_values={
                "partner_name": partner_name.value,
                "file_name": file_name,
                "rows": row_count,
            },
        ))
        return record

    async def preview_import(
        self, import_id: uuid.UUID
    ) -> ImportPreviewResponse:
        """Read CSV and attempt auto-matching of participants and test names."""
        result = await self.db.execute(
            select(PartnerLabImport).where(PartnerLabImport.id == import_id)
        )
        record = result.scalar_one_or_none()
        if record is None:
            raise ValueError("Import record not found.")

        if not record.source_file_path or not os.path.exists(record.source_file_path):
            raise ValueError("Source file not found on disk.")

        with open(record.source_file_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        # Load alias lookup for this partner
        alias_result = await self.db.execute(
            select(TestNameAlias).where(
                TestNameAlias.partner_name == record.partner_name
            )
        )
        aliases = {a.alias_name.lower(): a for a in alias_result.scalars().all()}

        preview_rows: list[ImportPreviewRow] = []
        matched_count = 0
        total_rows = len(rows)
        preview_slice = rows[:20]

        # Batch: collect unique participant codes from preview rows
        unique_codes = set()
        for row in preview_slice:
            code = row.get("participant_code", row.get("participant_id", "")).strip()
            if code:
                unique_codes.add(code)

        # Single batch query for all unique participant codes using pg_trgm
        code_to_participant: dict[str, uuid.UUID] = {}
        if unique_codes:
            for code in unique_codes:
                p_result = await self.db.execute(
                    select(Participant.id, Participant.participant_code)
                    .where(
                        Participant.is_deleted == False,  # noqa: E712
                        text("similarity(participant.participant_code, :code) > 0.6"),
                    )
                    .params(code=code)
                    .order_by(text("similarity(participant.participant_code, :code) DESC"))
                    .limit(1)
                )
                row_result = p_result.one_or_none()
                if row_result:
                    code_to_participant[code] = row_result[0]

        for idx, row in enumerate(preview_slice):
            participant_code_raw = row.get("participant_code", row.get("participant_id", "")).strip()
            test_name_raw = row.get("test_name", row.get("test", "")).strip()
            test_value = row.get("value", row.get("test_value", "")).strip() or None
            issues: list[str] = []

            matched_participant_id = None
            if participant_code_raw:
                matched_participant_id = code_to_participant.get(participant_code_raw)
                if matched_participant_id is None:
                    issues.append("Participant not matched")
            else:
                issues.append("Missing participant code")

            matched_test_id = None
            if test_name_raw:
                alias = aliases.get(test_name_raw.lower())
                if alias:
                    matched_test_id = alias.canonical_test_id
                else:
                    issues.append("Test name not matched to canonical test")
            else:
                issues.append("Missing test name")

            if matched_participant_id and matched_test_id:
                matched_count += 1

            preview_rows.append(ImportPreviewRow(
                row_number=idx + 1,
                participant_code_raw=participant_code_raw,
                test_name_raw=test_name_raw,
                test_value=test_value,
                matched_participant_id=matched_participant_id,
                matched_test_id=matched_test_id,
                issues=issues,
            ))

        return ImportPreviewResponse(
            total_rows=total_rows,
            matched_rows=matched_count,
            unmatched_rows=len(preview_slice) - matched_count,
            preview_rows=preview_rows,
        )

    async def configure_import(
        self,
        import_id: uuid.UUID,
        data: ImportConfigureRequest,
        configured_by: uuid.UUID,
    ) -> PartnerLabImport | None:
        """Save field mapping and test name mapping configuration on the import."""
        result = await self.db.execute(
            select(PartnerLabImport).where(PartnerLabImport.id == import_id)
        )
        record = result.scalar_one_or_none()
        if record is None:
            return None

        # Store configuration in notes as JSON-serializable info
        record.notes = (
            f"field_mapping: {data.field_mapping}, "
            f"test_name_mapping: {data.test_name_mapping}"
        )

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=configured_by,
            action=AuditAction.UPDATE,
            entity_type="partner_lab_import",
            entity_id=record.id,
            new_values={"configured": True},
        ))
        return record

    async def execute_import(
        self,
        import_id: uuid.UUID,
        executed_by: uuid.UUID,
    ) -> tuple[PartnerLabImport, int, int, int]:
        """Create PartnerLabResult records from CSV with matching."""
        result = await self.db.execute(
            select(PartnerLabImport).where(PartnerLabImport.id == import_id)
        )
        record = result.scalar_one_or_none()
        if record is None:
            raise ValueError("Import record not found.")

        if not record.source_file_path or not os.path.exists(record.source_file_path):
            raise ValueError("Source file not found on disk.")

        with open(record.source_file_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        # Load alias lookup for this partner
        alias_result = await self.db.execute(
            select(TestNameAlias).where(
                TestNameAlias.partner_name == record.partner_name
            )
        )
        aliases = {a.alias_name.lower(): a for a in alias_result.scalars().all()}

        records_matched = 0
        records_failed = 0
        records_total = len(rows)

        # Batch: collect unique participant codes and pre-match them all
        unique_codes: set[str] = set()
        for row in rows:
            code = row.get("participant_code", row.get("participant_id", "")).strip()
            if code:
                unique_codes.add(code)

        code_to_participant: dict[str, uuid.UUID] = {}
        # Process in batches of 500 to avoid overwhelming the DB
        code_list = list(unique_codes)
        for batch_start in range(0, len(code_list), 500):
            batch = code_list[batch_start:batch_start + 500]
            for code in batch:
                p_result = await self.db.execute(
                    select(Participant.id)
                    .where(
                        Participant.is_deleted == False,  # noqa: E712
                        text("similarity(participant.participant_code, :code) > 0.6"),
                    )
                    .params(code=code)
                    .order_by(text("similarity(participant.participant_code, :code) DESC"))
                    .limit(1)
                )
                pid = p_result.scalar_one_or_none()
                if pid:
                    code_to_participant[code] = pid

        for row in rows:
            participant_code_raw = row.get("participant_code", row.get("participant_id", "")).strip()
            test_name_raw = row.get("test_name", row.get("test", "")).strip()
            test_value = row.get("value", row.get("test_value", "")).strip() or None
            test_unit = row.get("unit", row.get("test_unit", "")).strip() or None
            reference_range = row.get("reference_range", "").strip() or None

            # Match participant from pre-built lookup
            matched_participant_id = code_to_participant.get(participant_code_raw) if participant_code_raw else None
            match_status = MatchStatus.AUTO_MATCHED if matched_participant_id else MatchStatus.UNMATCHED

            # Match test name
            canonical_test_id = None
            if test_name_raw:
                alias = aliases.get(test_name_raw.lower())
                if alias:
                    canonical_test_id = alias.canonical_test_id

            if matched_participant_id:
                records_matched += 1
            else:
                records_failed += 1

            lab_result = PartnerLabResult(
                id=uuid.uuid4(),
                import_id=import_id,
                participant_id=matched_participant_id,
                participant_code_raw=participant_code_raw,
                test_name_raw=test_name_raw,
                canonical_test_id=canonical_test_id,
                test_value=test_value,
                test_unit=test_unit,
                reference_range=reference_range,
                raw_data=row,
                match_status=match_status,
            )
            self.db.add(lab_result)

        record.records_total = records_total
        record.records_matched = records_matched
        record.records_failed = records_failed
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=executed_by,
            action=AuditAction.UPDATE,
            entity_type="partner_lab_import",
            entity_id=record.id,
            new_values={
                "executed": True,
                "records_total": records_total,
                "records_matched": records_matched,
                "records_failed": records_failed,
            },
        ))
        return record, records_total, records_matched, records_failed

    async def list_imports(
        self,
        partner_name: PartnerName | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[PartnerLabImport], int]:
        query = select(PartnerLabImport).order_by(PartnerLabImport.created_at.desc())
        if partner_name:
            query = query.where(PartnerLabImport.partner_name == partner_name)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_import_detail(
        self, import_id: uuid.UUID
    ) -> PartnerLabImport | None:
        result = await self.db.execute(
            select(PartnerLabImport)
            .options(selectinload(PartnerLabImport.results))
            .where(PartnerLabImport.id == import_id)
        )
        return result.scalar_one_or_none()

    async def list_partner_results(
        self,
        participant_id: uuid.UUID | None = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[list[PartnerLabResult], int]:
        query = select(PartnerLabResult).order_by(PartnerLabResult.created_at.desc())
        if participant_id:
            query = query.where(PartnerLabResult.participant_id == participant_id)

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total


# ---------------------------------------------------------------------------
# Stool Kit Service
# ---------------------------------------------------------------------------


class StoolKitService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def issue_kit(
        self, data: StoolKitCreate, issued_by: uuid.UUID
    ) -> StoolKit:
        kit = StoolKit(
            id=uuid.uuid4(),
            participant_id=data.participant_id,
            field_event_id=data.field_event_id,
            kit_code=data.kit_code,
            issued_at=datetime.now(timezone.utc),
            issued_by=issued_by,
            status=StoolKitStatus.ISSUED,
        )
        self.db.add(kit)
        await self.db.flush()

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=issued_by,
            action=AuditAction.CREATE,
            entity_type="stool_kit",
            entity_id=kit.id,
            new_values={
                "participant_id": str(kit.participant_id),
                "kit_code": kit.kit_code,
                "status": kit.status.value,
            },
        ))
        return kit

    async def update_kit(
        self,
        kit_id: uuid.UUID,
        data: StoolKitUpdate,
        updated_by: uuid.UUID,
    ) -> StoolKit | None:
        result = await self.db.execute(
            select(StoolKit).where(
                StoolKit.id == kit_id,
                StoolKit.is_deleted == False,  # noqa: E712
            )
        )
        kit = result.scalar_one_or_none()
        if kit is None:
            return None

        # Validate status transition
        VALID_KIT_TRANSITIONS: dict[StoolKitStatus, set[StoolKitStatus]] = {
            StoolKitStatus.ISSUED: {StoolKitStatus.PICKUP_SCHEDULED},
            StoolKitStatus.PICKUP_SCHEDULED: {StoolKitStatus.COLLECTED_BY_DECODEAGE},
            StoolKitStatus.COLLECTED_BY_DECODEAGE: {StoolKitStatus.PROCESSING},
            StoolKitStatus.PROCESSING: {StoolKitStatus.RESULTS_RECEIVED},
            StoolKitStatus.RESULTS_RECEIVED: set(),
        }
        allowed = VALID_KIT_TRANSITIONS.get(kit.status, set())
        if data.status != kit.status and data.status not in allowed:
            raise ValueError(
                f"Cannot transition stool kit from '{kit.status.value}' to '{data.status.value}'. "
                f"Allowed: {', '.join(s.value for s in allowed) if allowed else 'none (terminal)'}."
            )

        old_values: dict[str, str | None] = {"status": kit.status.value}
        if kit.decodeage_pickup_date is not None:
            old_values["decodeage_pickup_date"] = str(kit.decodeage_pickup_date)
        new_values: dict[str, str | None] = {"status": data.status.value}

        kit.status = data.status

        if data.decodeage_pickup_date is not None:
            old_values["decodeage_pickup_date"] = str(kit.decodeage_pickup_date)
            kit.decodeage_pickup_date = data.decodeage_pickup_date
            new_values["decodeage_pickup_date"] = str(data.decodeage_pickup_date)

        if data.notes is not None:
            kit.notes = data.notes

        # Auto-set results_received_at when transitioning to RESULTS_RECEIVED
        if data.status == StoolKitStatus.RESULTS_RECEIVED and kit.results_received_at is None:
            kit.results_received_at = datetime.now(timezone.utc)

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=updated_by,
            action=AuditAction.UPDATE,
            entity_type="stool_kit",
            entity_id=kit.id,
            old_values=old_values,
            new_values=new_values,
        ))
        return kit

    async def list_kits(
        self,
        participant_id: uuid.UUID | None = None,
        status: StoolKitStatus | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[StoolKit], int]:
        query = select(StoolKit).where(StoolKit.is_deleted == False)  # noqa: E712

        if participant_id:
            query = query.where(StoolKit.participant_id == participant_id)
        if status:
            query = query.where(StoolKit.status == status)

        query = query.order_by(StoolKit.created_at.desc())

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()
        query = query.offset((page - 1) * per_page).limit(per_page)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total
