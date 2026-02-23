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
    AgeGroup,
    AuditAction,
    EnrollmentSource,
    MatchStatus,
    OdkProcessingStatus,
    OdkSyncStatus,
    PartnerName,
    Sex,
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
from app.models.participant import CollectionSite, Participant
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
# ODK Submission Parsing Helpers
# ---------------------------------------------------------------------------

_AGE_GROUP_MAP = {1: AgeGroup.AGE_18_29, 2: AgeGroup.AGE_30_44, 3: AgeGroup.AGE_45_59, 4: AgeGroup.AGE_60_74, 5: AgeGroup.AGE_75_PLUS}
_SEX_MAP = {"A": Sex.MALE, "B": Sex.FEMALE}

# Site assignment by participant number range
# Key: (min, max) inclusive → site code
_SITE_RANGES = [
    (1, 100, "RMH"),       # M.S. Ramaiah Memorial Hospital
    (101, 200, "SSSSMH"),  # Sri Sathya Sai Sarla Memorial Hospital
    (201, 400, "BBH"),     # Bangalore Baptist Hospital
    (401, 500, "CHAF"),    # Command Hospital Air Force
]

# Fields to strip from stored submission data (PII/sensitive)
_SENSITIVE_FIELDS = {
    ("participant_identifier", "name"),
    ("continue_section", "phone"),
}


def _get_site_code_for_number(participant_number: int) -> str | None:
    """Return site code based on participant number range."""
    for low, high, code in _SITE_RANGES:
        if low <= participant_number <= high:
            return code
    return None


def _strip_sensitive_fields(submission: dict) -> dict:
    """Remove PII fields from submission data before storage."""
    import copy
    cleaned = copy.deepcopy(submission)
    for path in _SENSITIVE_FIELDS:
        d = cleaned
        for key in path[:-1]:
            d = d.get(key, {})
            if not isinstance(d, dict):
                break
        else:
            d.pop(path[-1], None)
    # Also strip from the all_data summary section
    all_data = cleaned.get("continue_section", {}).get("all_data", {})
    if isinstance(all_data, dict):
        all_data.pop("calc_name", None)
        all_data.pop("calc_phone", None)
        all_data.pop("display_name", None)
        all_data.pop("display_phone", None)
    return cleaned


def _parse_participant_from_odk(submission: dict) -> dict | None:
    """Extract participant metadata from an ODK submission.

    Returns dict with participant_code, group_code, participant_number,
    age_group, sex, date_of_birth or None if unparseable.
    """
    import re

    pid_section = submission.get("participant_identifier", {})
    code = pid_section.get("participant_id", "")
    if not code:
        return None

    # Code format: {digit}{A|B}-{number} e.g. "5B-213"
    m = re.match(r"^(\d)([AB])-(\d+)$", code)
    if not m:
        return None

    age_digit = int(m.group(1))
    sex_letter = m.group(2)
    number = int(m.group(3))

    age_group = _AGE_GROUP_MAP.get(age_digit)
    sex = _SEX_MAP.get(sex_letter)
    if age_group is None or sex is None:
        return None

    # Extract DOB from continue_section
    cont = submission.get("continue_section", {})
    dob = None
    dob_str = cont.get("dob")
    if dob_str:
        try:
            from datetime import date as _date
            dob = _date.fromisoformat(dob_str)
        except (ValueError, TypeError):
            pass

    return {
        "participant_code": code,
        "group_code": f"{age_digit}{sex_letter}",
        "participant_number": number,
        "age_group": age_group,
        "sex": sex,
        "date_of_birth": dob,
    }


def _safe_get(d: dict, *keys, default=None):
    """Safely navigate nested dict keys."""
    for k in keys:
        if not isinstance(d, dict):
            return default
        d = d.get(k, default)
    return d


def _extract_clinical_data(submission: dict) -> dict:
    """Extract structured clinical summary from ODK submission."""
    cont = submission.get("continue_section", {})
    clin = cont.get("clinical_examination_data", {})
    comorbid = cont.get("comorbid_illness", {})
    family = cont.get("family_history", {})
    addiction = cont.get("addiction_habitual_data", {})
    lifestyle = cont.get("lifestyle_wellness_data", {})
    qol = cont.get("quality_of_life_assessment", {})

    vitals = clin.get("vital_signs", {})
    anthro = clin.get("anthropometry", {})
    head_to_toe = clin.get("head_to_toe", {})
    systemic = clin.get("systemic", {})

    dass = lifestyle.get("dass21_group", {})
    psqi = lifestyle.get("psqi_group", {})
    mmse = qol.get("mmse", {})
    frailty = qol.get("frailty_group", {})
    who = qol.get("who_group", {})

    return {
        "demographics": {
            "age": cont.get("age"),
            "gender": cont.get("gender"),
            "dob": cont.get("dob"),
            "language": cont.get("language"),
            "pin_code": cont.get("current_pin"),
            "residential_area": cont.get("residential_area"),
            "living_arrangement": cont.get("living_arrangement"),
            "marital_status": cont.get("marital_status"),
            "religion": cont.get("religion"),
            "education": cont.get("education"),
            "occupation": cont.get("occupation"),
            "monthly_income": cont.get("monthly_income"),
            "socioeconomic_status": cont.get("socioeconomic_status"),
            "no_of_family_members": cont.get("no_of_family_members"),
        },
        "vitals": {
            "pulse_rate": vitals.get("pulse_rate"),
            "bp_sbp": vitals.get("bp_sbp"),
            "bp_dbp": vitals.get("bp_dbp"),
            "resp_rate": vitals.get("resp_rate"),
            "spo2": vitals.get("spo2"),
            "temperature": vitals.get("temperature"),
        },
        "anthropometry": {
            "height_cm": anthro.get("height_cm"),
            "weight_kg": anthro.get("weight_kg"),
            "bmi": anthro.get("bmi"),
        },
        "head_to_toe": head_to_toe,
        "systemic": {
            "cvs": systemic.get("cvs"),
            "rs": systemic.get("rs"),
            "per_abdomen": systemic.get("pa"),
            "msk_exam": systemic.get("msk_exam"),
            "handgrip_strength": systemic.get("handgrip_strength"),
            "age_reader_test": systemic.get("age_reader_test"),
        },
        "comorbidities": {
            "dm": comorbid.get("dm_history") == "yes",
            "dm_type": comorbid.get("dm_type"),
            "dm_duration": comorbid.get("dm_duration"),
            "htn": comorbid.get("htn_history") == "yes",
            "htn_duration": comorbid.get("htn_duration"),
            "bronchial_asthma": comorbid.get("ba_history") == "yes",
            "ihd": comorbid.get("ihd_history") == "yes",
            "hypothyroid": comorbid.get("hypo_history") == "yes",
            "epilepsy": comorbid.get("epilepsy_history") == "yes",
            "psychiatric": comorbid.get("psych_history") == "yes",
            "covid_history": comorbid.get("covid_history") == "yes",
            "covid_vaccinated": comorbid.get("covid_vaccinated") == "yes",
            "covid_doses": comorbid.get("covid_doses"),
            "other": comorbid.get("other_comorbids"),
        },
        "family_history": {
            "dm": family.get("fh_dm") == "yes",
            "ihd": family.get("fh_ihd") == "yes",
            "cancer": family.get("fh_cancer") == "yes",
            "neurodegenerative": family.get("fh_nd") == "yes",
        },
        "addiction": {
            "smoking_status": addiction.get("smoking_status"),
            "smokeless_status": addiction.get("smokeless_status"),
            "alcohol_status": addiction.get("alcohol_status"),
            "passive_smoke": addiction.get("passive_smoke"),
        },
        "lifestyle": {
            "dietary_pattern": lifestyle.get("dietary_pattern"),
            "bowel_frequency": lifestyle.get("bowel_frequency"),
            "water_per_day": lifestyle.get("water_per_day"),
            "probiotics_use": lifestyle.get("probiotics_use"),
            "supplement_use": lifestyle.get("supplement_use"),
            "exercise": lifestyle.get("exercise_group"),
        },
        "scores": {
            "dass_depression": _try_int(dass.get("score_depression")),
            "dass_anxiety": _try_int(dass.get("score_anxiety")),
            "dass_stress": _try_int(dass.get("score_stress")),
            "dass_total": _try_int(dass.get("dass_total_score")),
            "depression_level": dass.get("depression_level"),
            "anxiety_level": dass.get("anxiety_level"),
            "stress_level": dass.get("stress_level"),
            "mmse_total": _try_int(mmse.get("total_score")),
            "frail_score": _try_int(frailty.get("frail_score")),
            "frail_category": frailty.get("frail_category"),
            "sleep_hours": psqi.get("sleep_hours"),
            "sleep_latency": psqi.get("sleep_latency"),
        },
        "who_qol": who,
        "female_specific": {
            "menopausal_status": cont.get("menopausal_status"),
            "lmp": cont.get("lmp"),
            "pcos_history": cont.get("pcos_history"),
        } if cont.get("gender") == "female" else None,
    }


def _try_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


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
        """Pull submissions from ODK Central and create/update participants.

        Connects to ODK Central OData API, fetches all submissions,
        skips duplicates (by odk_instance_id), and creates Participant
        records with clinical data extracted from the submission.
        """
        from app.config import settings
        from app.services.odk_client import OdkCentralClient

        now = datetime.now(timezone.utc)
        log = OdkSyncLog(
            id=uuid.uuid4(),
            sync_started_at=now,
            status=OdkSyncStatus.RUNNING,
            submissions_found=0,
            submissions_processed=0,
            submissions_failed=0,
            created_by=triggered_by,
        )
        self.db.add(log)
        await self.db.flush()

        if not settings.ODK_CENTRAL_URL:
            log.status = OdkSyncStatus.FAILED
            log.error_message = "ODK_CENTRAL_URL not configured"
            log.sync_completed_at = datetime.now(timezone.utc)
            return log

        try:
            client = OdkCentralClient(
                base_url=settings.ODK_CENTRAL_URL,
                email=settings.ODK_CENTRAL_EMAIL,
                password=settings.ODK_CENTRAL_PASSWORD,
            )
            project_id = settings.ODK_PROJECT_ID
            odk_form_id = form_id or settings.ODK_FORM_ID

            submissions = await client.get_all_submissions(project_id, odk_form_id)
            log.submissions_found = len(submissions)

            # Load all collection sites keyed by code for range-based assignment
            site_result = await self.db.execute(select(CollectionSite))
            all_sites = {s.code: s for s in site_result.scalars().all()}
            if not all_sites:
                log.status = OdkSyncStatus.FAILED
                log.error_message = "No collection sites found"
                log.sync_completed_at = datetime.now(timezone.utc)
                return log

            processed = 0
            failed = 0

            for submission in submissions:
                try:
                    instance_id = submission.get("__id", "")
                    if not instance_id:
                        failed += 1
                        continue

                    # Check for duplicate
                    dup = await self.db.execute(
                        select(OdkSubmission.id).where(
                            OdkSubmission.odk_instance_id == instance_id
                        )
                    )
                    if dup.scalar_one_or_none() is not None:
                        continue  # Already imported, skip silently

                    # Parse participant data
                    p_data = _parse_participant_from_odk(submission)
                    if not p_data:
                        self.db.add(OdkSubmission(
                            id=uuid.uuid4(),
                            odk_instance_id=instance_id,
                            odk_form_id=odk_form_id,
                            odk_form_version=submission.get("__system", {}).get("formVersion"),
                            submission_data=cleaned_submission,
                            processing_status=OdkProcessingStatus.FAILED,
                            error_message="Could not parse participant code",
                        ))
                        failed += 1
                        continue

                    # Resolve collection site from participant number
                    site_code = _get_site_code_for_number(p_data["participant_number"])
                    site = all_sites.get(site_code) if site_code else None
                    if site is None:
                        cleaned_submission = _strip_sensitive_fields(submission)
                        self.db.add(OdkSubmission(
                            id=uuid.uuid4(),
                            odk_instance_id=instance_id,
                            odk_form_id=odk_form_id,
                            odk_form_version=submission.get("__system", {}).get("formVersion"),
                            participant_code_raw=p_data["participant_code"],
                            submission_data=cleaned_submission,
                            processing_status=OdkProcessingStatus.FAILED,
                            error_message=f"Participant number {p_data['participant_number']} does not match any site range",
                        ))
                        failed += 1
                        continue

                    # Check if participant already exists
                    existing = await self.db.execute(
                        select(Participant).where(
                            Participant.participant_code == p_data["participant_code"]
                        )
                    )
                    participant = existing.scalar_one_or_none()

                    clinical = _extract_clinical_data(submission)
                    # Strip PII before storing raw submission
                    cleaned_submission = _strip_sensitive_fields(submission)

                    if participant is None:
                        # Create new participant
                        participant = Participant(
                            id=uuid.uuid4(),
                            participant_code=p_data["participant_code"],
                            group_code=p_data["group_code"],
                            participant_number=p_data["participant_number"],
                            age_group=p_data["age_group"],
                            sex=p_data["sex"],
                            date_of_birth=p_data.get("date_of_birth"),
                            collection_site_id=site.id,
                            enrollment_date=datetime.now(timezone.utc),
                            enrollment_source=EnrollmentSource.ODK,
                            odk_submission_id=instance_id,
                            clinical_data=clinical,
                            wave=1,
                            created_by=triggered_by,
                        )
                        self.db.add(participant)
                        await self.db.flush()
                    else:
                        # Update existing participant's clinical data and site
                        participant.clinical_data = clinical
                        participant.odk_submission_id = instance_id
                        participant.collection_site_id = site.id

                    # Store submission record (PII stripped)
                    self.db.add(OdkSubmission(
                        id=uuid.uuid4(),
                        odk_instance_id=instance_id,
                        odk_form_id=odk_form_id,
                        odk_form_version=submission.get("__system", {}).get("formVersion"),
                        participant_id=participant.id,
                        participant_code_raw=p_data["participant_code"],
                        submission_data=cleaned_submission,
                        processed_at=datetime.now(timezone.utc),
                        processing_status=OdkProcessingStatus.PROCESSED,
                    ))
                    processed += 1

                except Exception as e:
                    logger.error("Failed to process submission %s: %s", instance_id, e)
                    failed += 1

            log.submissions_processed = processed
            log.submissions_failed = failed
            log.status = OdkSyncStatus.COMPLETED
            log.sync_completed_at = datetime.now(timezone.utc)

        except Exception as e:
            logger.exception("ODK sync failed: %s", e)
            log.status = OdkSyncStatus.FAILED
            log.error_message = str(e)[:500]
            log.sync_completed_at = datetime.now(timezone.utc)

        self.db.add(AuditLog(
            id=uuid.uuid4(),
            user_id=triggered_by,
            action=AuditAction.CREATE,
            entity_type="odk_sync_log",
            entity_id=log.id,
            new_values={
                "form_id": form_id or "all",
                "status": log.status.value,
                "found": log.submissions_found,
                "processed": log.submissions_processed,
                "failed": log.submissions_failed,
            },
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
