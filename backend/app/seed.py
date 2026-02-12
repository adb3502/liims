"""Seed the LIIMS database with realistic demo data for the BHARAT Study.

Idempotent: checks for existing data before inserting.
Run via: python -m app.seed
"""

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import bcrypt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.enums import (
    AgeGroup,
    BoxMaterial,
    BoxType,
    ConsentType,
    EnrollmentSource,
    FieldEventStatus,
    FieldEventType,
    FreezerType,
    IccStatus,
    InstrumentType,
    MatchStatus,
    OmicsResultType,
    PartnerName,
    QCStatus,
    RunStatus,
    RunType,
    SampleStatus,
    SampleType,
    SettingValueType,
    Sex,
    StoolKitStatus,
)
from app.models.field_ops import FieldEvent, FieldEventParticipant
from app.models.instrument import (
    Instrument,
    InstrumentRun,
    InstrumentRunSample,
    Plate,
    QCTemplate,
)
from app.models.omics import IccProcessing, OmicsResult, OmicsResultSet
from app.models.participant import CollectionSite, Consent, Participant
from app.models.partner import (
    CanonicalTest,
    PartnerLabImport,
    PartnerLabResult,
    StoolKit,
    TestNameAlias,
)
from app.models.sample import Sample, SampleStatusHistory
from app.models.storage import (
    Freezer,
    StorageBox,
    StoragePosition,
    StorageRack,
)
from app.models.system import SystemSetting
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

IST = timezone(timedelta(hours=5, minutes=30))


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def _past(days_ago: int = 30) -> datetime:
    return datetime.now(IST) - timedelta(days=days_ago)


def _rand_date(start_days_ago: int = 180, end_days_ago: int = 1) -> date:
    delta = random.randint(end_days_ago, start_days_ago)
    return (datetime.now(IST) - timedelta(days=delta)).date()


def _rand_dt(start_days_ago: int = 180, end_days_ago: int = 1) -> datetime:
    delta = random.randint(end_days_ago, start_days_ago)
    return datetime.now(IST) - timedelta(days=delta, hours=random.randint(0, 12))


# ---------------------------------------------------------------------------
# 1. Users
# ---------------------------------------------------------------------------

SEED_USERS = [
    ("admin@liims.iisc.ac.in", "Admin@123", "Dr. Ananya Sharma", "super_admin"),
    ("labmgr@liims.iisc.ac.in", "LabMgr@123", "Priya Venkatesh", "lab_manager"),
    ("tech@liims.iisc.ac.in", "Tech@123", "Rahul Patil", "lab_technician"),
    ("field@liims.iisc.ac.in", "Field@123", "Kavitha Reddy", "field_coordinator"),
    ("pi@liims.iisc.ac.in", "PI@123", "Prof. Suresh Rattan", "pi_researcher"),
]


async def seed_users(session: AsyncSession) -> dict[str, uuid.UUID]:
    """Create demo users. Returns {email: user_id} mapping."""
    result = await session.execute(
        select(User).where(User.email == SEED_USERS[0][0])
    )
    if result.scalar_one_or_none() is not None:
        print("[users] Already seeded, loading ids...")
        rows = await session.execute(select(User.email, User.id))
        return {r[0]: r[1] for r in rows.all()}

    users: dict[str, uuid.UUID] = {}
    for email, pw, name, role_str in SEED_USERS:
        uid = uuid.uuid4()
        session.add(
            User(
                id=uid,
                email=email,
                password_hash=_hash(pw),
                full_name=name,
                role=role_str,
                is_active=True,
            )
        )
        users[email] = uid
        print(f"  [users] Created {email} ({role_str})")
    await session.flush()
    return users


# ---------------------------------------------------------------------------
# 2. System Settings
# ---------------------------------------------------------------------------

DEFAULT_SETTINGS = [
    ("session", "timeout_minutes", "30", SettingValueType.INTEGER, "Session inactivity timeout in minutes"),
    ("session", "max_concurrent", "3", SettingValueType.INTEGER, "Maximum concurrent sessions per user"),
    ("odk", "sync_interval_minutes", "60", SettingValueType.INTEGER, "ODK sync interval in minutes"),
    ("odk", "central_url", "", SettingValueType.STRING, "ODK Central server URL"),
    ("email", "smtp_host", "", SettingValueType.STRING, "SMTP server hostname"),
    ("email", "smtp_port", "587", SettingValueType.INTEGER, "SMTP server port"),
    ("email", "smtp_use_tls", "true", SettingValueType.BOOLEAN, "Use TLS for SMTP"),
    ("email", "from_name", "LIIMS Alerts", SettingValueType.STRING, "Email from name"),
    ("dashboard", "refresh_interval_minutes", "15", SettingValueType.INTEGER, "Dashboard cache refresh interval"),
    ("dashboard", "default_page_size", "25", SettingValueType.INTEGER, "Default pagination page size"),
    ("backup", "check_interval_hours", "24", SettingValueType.INTEGER, "Backup staleness check interval"),
    ("processing", "plasma_timer_minutes", "30", SettingValueType.INTEGER, "Plasma processing timeout"),
    ("processing", "timer_warning_minutes", "20", SettingValueType.INTEGER, "Processing timer warning threshold"),
    ("processing", "volume_warning_threshold_ul", "100", SettingValueType.INTEGER, "Volume warning threshold (uL)"),
    ("study", "current_wave", "1", SettingValueType.INTEGER, "Current study wave number"),
    ("study", "enrollment_active", "true", SettingValueType.BOOLEAN, "Whether new enrollment is active"),
    (
        "study",
        "aliquot_rules",
        '{"plasma":{"count":5,"volume_ul":500},"epigenetics":{"count":4,"volume_ul":570},'
        '"urine":{"count":1,"volume_ul":3750},"hair":{"count":2},"cheek_swab":{"count":1},'
        '"rbc_smear":{"count":1},"extra_blood":{"count":1}}',
        SettingValueType.JSON,
        "Auto-aliquot generation rules per sample type",
    ),
]


async def seed_settings(session: AsyncSession) -> None:
    result = await session.execute(select(SystemSetting).limit(1))
    if result.scalar_one_or_none() is not None:
        print("[settings] Already seeded, skipping.")
        return
    for cat, key, val, vt, desc in DEFAULT_SETTINGS:
        session.add(
            SystemSetting(id=uuid.uuid4(), category=cat, key=key, value=val, value_type=vt, description=desc)
        )
    print(f"  [settings] Seeded {len(DEFAULT_SETTINGS)} system settings.")
    await session.flush()


# ---------------------------------------------------------------------------
# 3. Collection Sites
# ---------------------------------------------------------------------------

SITES = [
    ("IISc Main Campus", "IISC", 1, 2000, "Indian Institute of Science, CV Raman Road, Bangalore 560012"),
    ("Jigani Rural Centre", "JIG", 2001, 4000, "Jigani Hobli, Anekal Taluk, Bangalore Rural 560105"),
    ("Jayanagar Urban Clinic", "JNR", 4001, 6000, "4th T Block, Jayanagar, Bangalore 560041"),
]


async def seed_sites(session: AsyncSession, admin_id: uuid.UUID) -> dict[str, uuid.UUID]:
    result = await session.execute(
        select(CollectionSite).where(CollectionSite.code == SITES[0][1])
    )
    if result.scalar_one_or_none() is not None:
        print("[sites] Already seeded, loading ids...")
        rows = await session.execute(select(CollectionSite.code, CollectionSite.id))
        return {r[0]: r[1] for r in rows.all()}

    sites: dict[str, uuid.UUID] = {}
    for name, code, rstart, rend, addr in SITES:
        sid = uuid.uuid4()
        session.add(
            CollectionSite(
                id=sid,
                name=name,
                code=code,
                participant_range_start=rstart,
                participant_range_end=rend,
                city="Bangalore",
                address=addr,
                is_active=True,
                created_by=admin_id,
            )
        )
        sites[code] = sid
        print(f"  [sites] Created {code}: {name}")
    await session.flush()
    return sites


# ---------------------------------------------------------------------------
# 4. Participants (50 across 3 waves)
# ---------------------------------------------------------------------------

# Indian names for realistic data
FIRST_NAMES_M = [
    "Arun", "Vijay", "Rajesh", "Suresh", "Ganesh", "Ravi", "Krishna",
    "Mohan", "Ramesh", "Srinivas", "Mahesh", "Deepak", "Prakash",
    "Venkatesh", "Kiran", "Naveen", "Santosh", "Harish", "Gopal", "Manoj",
]
FIRST_NAMES_F = [
    "Lakshmi", "Priya", "Kavitha", "Sunita", "Anitha", "Deepa", "Rekha",
    "Meena", "Sarala", "Padma", "Radha", "Geetha", "Revathi", "Shanta",
    "Vasantha", "Kamala", "Sumathi", "Nirmala", "Prema", "Jayanthi",
]

GROUP_CODES = ["M1", "M2", "M3", "F1", "F2", "F3", "M4", "F4", "M5", "F5"]


async def seed_participants(
    session: AsyncSession,
    site_map: dict[str, uuid.UUID],
    admin_id: uuid.UUID,
) -> list[tuple[uuid.UUID, str, uuid.UUID]]:
    """Seed 50 participants. Returns list of (id, code, site_id)."""
    result = await session.execute(select(func.count()).select_from(Participant))
    count = result.scalar()
    if count and count >= 50:
        print(f"[participants] Already have {count}, loading ids...")
        rows = await session.execute(
            select(Participant.id, Participant.participant_code, Participant.collection_site_id)
        )
        return [(r[0], r[1], r[2]) for r in rows.all()]

    site_codes = list(site_map.keys())
    participants: list[tuple[uuid.UUID, str, uuid.UUID]] = []

    for i in range(50):
        site_code = site_codes[i % len(site_codes)]
        site_id = site_map[site_code]
        wave = (i // 20) + 1  # 20 in wave 1, 20 in wave 2, 10 in wave 3
        sex = Sex.MALE if i % 2 == 0 else Sex.FEMALE
        age_group = random.choice(list(AgeGroup))
        group_code = random.choice(GROUP_CODES)
        pnum = SITES[site_codes.index(site_code)][2] + i
        pcode = f"BH-{site_code}-{pnum:04d}"

        pid = uuid.uuid4()
        session.add(
            Participant(
                id=pid,
                participant_code=pcode,
                group_code=group_code,
                participant_number=pnum,
                age_group=age_group,
                sex=sex,
                collection_site_id=site_id,
                enrollment_date=_rand_dt(360, 10),
                enrollment_source=random.choice(list(EnrollmentSource)),
                wave=wave,
                completion_pct=Decimal(str(random.randint(20, 100))),
                created_by=admin_id,
            )
        )
        participants.append((pid, pcode, site_id))

    await session.flush()  # flush participants before inserting consents (FK)

    for pid, _, _ in participants:
        for ct in [ConsentType.HOUSEHOLD, ConsentType.INDIVIDUAL]:
            session.add(
                Consent(
                    id=uuid.uuid4(),
                    participant_id=pid,
                    consent_type=ct,
                    consent_given=True,
                    consent_date=_rand_date(360, 10),
                    form_version="3.1",
                    created_by=admin_id,
                )
            )

    await session.flush()
    print(f"  [participants] Seeded 50 participants with consents.")
    return participants


# ---------------------------------------------------------------------------
# 5. Samples (200+ across various types)
# ---------------------------------------------------------------------------

SAMPLE_TYPES_WEIGHT = [
    (SampleType.PLASMA, 5),
    (SampleType.EPIGENETICS, 4),
    (SampleType.EXTRA_BLOOD, 1),
    (SampleType.RBC_SMEAR, 1),
    (SampleType.CHEEK_SWAB, 1),
    (SampleType.HAIR, 1),
    (SampleType.URINE, 1),
    (SampleType.STOOL_KIT, 1),
]


async def seed_samples(
    session: AsyncSession,
    participants: list[tuple[uuid.UUID, str, uuid.UUID]],
    tech_id: uuid.UUID,
) -> list[uuid.UUID]:
    """Seed 200+ samples across participants. Returns sample ids."""
    result = await session.execute(select(func.count()).select_from(Sample))
    count = result.scalar()
    if count and count >= 200:
        print(f"[samples] Already have {count}, loading ids...")
        rows = await session.execute(select(Sample.id))
        return [r[0] for r in rows.all()]

    statuses = [
        SampleStatus.COLLECTED,
        SampleStatus.RECEIVED,
        SampleStatus.PROCESSING,
        SampleStatus.STORED,
        SampleStatus.IN_ANALYSIS,
    ]

    sample_ids: list[uuid.UUID] = []
    sample_status_entries: list[tuple] = []
    sample_counter = 0

    for pid, pcode, site_id in participants:
        # Each participant gets a random set of sample types
        n_types = random.randint(3, 6)
        chosen_types = random.sample(
            [st for st, _ in SAMPLE_TYPES_WEIGHT], min(n_types, len(SAMPLE_TYPES_WEIGHT))
        )

        for stype in chosen_types:
            sample_counter += 1
            sid = uuid.uuid4()
            status = random.choice(statuses)
            col_dt = _rand_dt(120, 2)
            vol = Decimal(str(random.randint(200, 5000))) if stype in (
                SampleType.PLASMA, SampleType.URINE, SampleType.EPIGENETICS
            ) else None

            scode = f"{pcode}-{stype.value[:3].upper()}-{sample_counter:04d}"
            session.add(
                Sample(
                    id=sid,
                    sample_code=scode,
                    participant_id=pid,
                    sample_type=stype,
                    status=status,
                    initial_volume_ul=vol,
                    remaining_volume_ul=Decimal(str(float(vol) * random.uniform(0.3, 1.0))) if vol else None,
                    collection_datetime=col_dt,
                    collected_by=tech_id,
                    collection_site_id=site_id,
                    wave=random.choice([1, 1, 1, 2, 2, 3]),
                    created_by=tech_id,
                )
            )
            sample_ids.append(sid)
            sample_status_entries.append((sid, status, col_dt))

    await session.flush()  # flush samples before inserting status history (FK)

    for sid, status, col_dt in sample_status_entries:
        session.add(
            SampleStatusHistory(
                id=uuid.uuid4(),
                sample_id=sid,
                previous_status=None,
                new_status=status,
                changed_at=col_dt,
                changed_by=tech_id,
                notes="Initial collection",
            )
        )

    await session.flush()
    print(f"  [samples] Seeded {len(sample_ids)} samples with status history.")
    return sample_ids


# ---------------------------------------------------------------------------
# 6. Storage: Freezers, Racks, Boxes, Positions
# ---------------------------------------------------------------------------

FREEZERS = [
    ("ULT-01 (-150C)", FreezerType.MINUS_150, "Proteomics Lab, Room B204", 6, 10),
    ("ULT-02 (-80C)", FreezerType.MINUS_80, "Proteomics Lab, Room B204", 6, 10),
    ("ULT-03 (-80C)", FreezerType.MINUS_80, "Metabolomics Lab, Room B206", 4, 8),
    ("Fridge-01 (+4C)", FreezerType.PLUS_4, "Sample Processing Area, Room B201", 4, 6),
    ("RT-Cabinet-01", FreezerType.ROOM_TEMP, "Dry Storage, Room B210", 3, 4),
]


async def seed_storage(
    session: AsyncSession,
    admin_id: uuid.UUID,
    sample_ids: list[uuid.UUID],
    tech_id: uuid.UUID,
) -> None:
    result = await session.execute(select(func.count()).select_from(Freezer))
    count = result.scalar()
    if count and count >= 5:
        print("[storage] Already seeded, skipping.")
        return

    occupied_samples = random.sample(sample_ids, min(40, len(sample_ids)))
    sample_idx = 0

    # -- Freezers --
    freezer_data: list[tuple[uuid.UUID, str, int, int]] = []
    for fname, ftype, loc, rack_count, slots in FREEZERS:
        fid = uuid.uuid4()
        session.add(
            Freezer(
                id=fid,
                name=fname,
                freezer_type=ftype,
                location=loc,
                total_capacity=rack_count * slots * 81,
                rack_count=rack_count,
                slots_per_rack=slots,
                is_active=True,
                created_by=admin_id,
            )
        )
        freezer_data.append((fid, fname, rack_count, slots))

    await session.flush()  # flush freezers before racks (FK)

    # -- Racks --
    rack_data: list[tuple[uuid.UUID, str, int]] = []  # (rack_id, freezer_name, slots)
    for fid, fname, rack_count, slots in freezer_data:
        for r in range(1, rack_count + 1):
            rid = uuid.uuid4()
            session.add(
                StorageRack(
                    id=rid,
                    freezer_id=fid,
                    rack_name=f"Rack-{r}",
                    position_in_freezer=r,
                    capacity=slots,
                )
            )
            rack_data.append((rid, fname, r))

    await session.flush()  # flush racks before boxes (FK)

    # -- Boxes --
    box_ids: list[uuid.UUID] = []
    for rid, fname, r in rack_data:
        for b in range(1, 3):
            bid = uuid.uuid4()
            session.add(
                StorageBox(
                    id=bid,
                    rack_id=rid,
                    box_name=f"{fname[:5]}-R{r}-B{b}",
                    box_label=f"Box {b} in Rack {r}",
                    rows=9,
                    columns=9,
                    box_type=BoxType.CRYO_81,
                    box_material=BoxMaterial.CARDBOARD_CRYO,
                    position_in_rack=b,
                    created_by=admin_id,
                )
            )
            box_ids.append(bid)

    await session.flush()  # flush boxes before positions (FK)

    # -- Positions --
    for bid in box_ids:
        for row in range(1, 10):
            for col in range(1, 10):
                pos_id = uuid.uuid4()
                occupied = (
                    sample_idx < len(occupied_samples)
                    and random.random() < 0.05
                )
                s_id = None
                occ_at = None
                if occupied:
                    s_id = occupied_samples[sample_idx]
                    occ_at = _rand_dt(60, 1)
                    sample_idx += 1
                session.add(
                    StoragePosition(
                        id=pos_id,
                        box_id=bid,
                        row=row,
                        column=col,
                        sample_id=s_id,
                        occupied_at=occ_at,
                    )
                )

    await session.flush()
    print(f"  [storage] Seeded 5 freezers with racks, boxes, and positions ({sample_idx} occupied).")


# ---------------------------------------------------------------------------
# 7. Field Events (3 events with participants)
# ---------------------------------------------------------------------------

FIELD_EVENTS = [
    ("Jigani Rural Camp - Wave 1", FieldEventType.RURAL_MASS, FieldEventStatus.COMPLETED, 60, 55),
    ("Jayanagar Urban Collection - Wave 1", FieldEventType.URBAN_SCHEDULED, FieldEventStatus.IN_PROGRESS, 40, 22),
    ("IISc Campus Drive - Wave 2", FieldEventType.URBAN_SCHEDULED, FieldEventStatus.PLANNED, 80, None),
]


async def seed_field_events(
    session: AsyncSession,
    site_map: dict[str, uuid.UUID],
    participants: list[tuple[uuid.UUID, str, uuid.UUID]],
    users: dict[str, uuid.UUID],
) -> None:
    result = await session.execute(select(func.count()).select_from(FieldEvent))
    count = result.scalar()
    if count and count >= 3:
        print("[field_events] Already seeded, skipping.")
        return

    field_id = users["field@liims.iisc.ac.in"]
    site_codes = list(site_map.keys())

    # Collect event data for linking participants after flush
    event_links: list[tuple[uuid.UUID, FieldEventStatus, int | None]] = []

    for idx, (name, etype, status, expected, actual) in enumerate(FIELD_EVENTS):
        eid = uuid.uuid4()
        site_code = site_codes[idx % len(site_codes)]
        event_date = _rand_date(90, 1) if status != FieldEventStatus.PLANNED else (
            datetime.now(IST) + timedelta(days=14)
        ).date()

        session.add(
            FieldEvent(
                id=eid,
                event_name=name,
                event_date=event_date,
                collection_site_id=site_map[site_code],
                event_type=etype,
                expected_participants=expected,
                actual_participants=actual,
                status=status,
                coordinator_id=field_id,
                partner_lab=PartnerName.HEALTHIANS,
                wave=1 if idx < 2 else 2,
                created_by=field_id,
            )
        )
        event_links.append((eid, status, actual))

    await session.flush()  # flush field events before linking participants (FK)

    # Link some participants to completed/in-progress events
    for eid, status, actual in event_links:
        if status != FieldEventStatus.PLANNED:
            n_link = min(actual or 5, len(participants))
            linked = random.sample(participants, n_link)
            for p_id, p_code, _ in linked:
                session.add(
                    FieldEventParticipant(
                        id=uuid.uuid4(),
                        event_id=eid,
                        participant_id=p_id,
                        check_in_time=_rand_dt(60, 1) if status == FieldEventStatus.COMPLETED else None,
                        wrist_tag_issued=status == FieldEventStatus.COMPLETED,
                        consent_verified=True,
                        samples_collected={"plasma": True, "urine": True} if status == FieldEventStatus.COMPLETED else None,
                        recorded_by=field_id,
                        recorded_at=_rand_dt(60, 1),
                    )
                )

    await session.flush()
    print("  [field_events] Seeded 3 field events with participant check-ins.")


# ---------------------------------------------------------------------------
# 8. Instruments, Runs, Plates
# ---------------------------------------------------------------------------

INSTRUMENTS = [
    ("Agilent Bravo", InstrumentType.LIQUID_HANDLER, "Agilent", "Bravo AssayMAP", "Proteomics Lab B204"),
    ("Thermo Q Exactive HF", InstrumentType.MASS_SPEC, "Thermo Fisher", "Q Exactive HF-X", "Proteomics Lab B204"),
    ("Waters Xevo TQ-XS", InstrumentType.MASS_SPEC, "Waters", "Xevo TQ-XS", "Metabolomics Lab B206"),
    ("Hamilton STARlet", InstrumentType.LIQUID_HANDLER, "Hamilton", "STARlet", "Sample Processing B201"),
    ("Leica DMi8", InstrumentType.OTHER, "Leica", "DMi8 Microscope", "ICC Lab B208"),
]


async def seed_instruments(
    session: AsyncSession,
    tech_id: uuid.UUID,
    sample_ids: list[uuid.UUID],
) -> list[uuid.UUID]:
    """Seed instruments, runs, plates with well assignments. Returns run ids."""
    result = await session.execute(select(func.count()).select_from(Instrument))
    count = result.scalar()
    if count and count >= 5:
        print("[instruments] Already seeded, loading run ids...")
        rows = await session.execute(select(InstrumentRun.id))
        return [r[0] for r in rows.all()]

    instrument_ids: list[uuid.UUID] = []
    for name, itype, mfr, model, loc in INSTRUMENTS:
        iid = uuid.uuid4()
        session.add(
            Instrument(
                id=iid,
                name=name,
                instrument_type=itype,
                manufacturer=mfr,
                model=model,
                location=loc,
                is_active=True,
            )
        )
        instrument_ids.append(iid)

    await session.flush()

    # QC template
    qc_id = uuid.uuid4()
    session.add(
        QCTemplate(
            id=qc_id,
            name="Standard Proteomics QC",
            description="Standard QC layout for 96-well proteomics runs",
            template_data={
                "qc_positions": ["A1", "A12", "H1", "H12"],
                "blank_positions": ["A6"],
                "pooled_qc": "E6",
            },
            run_type=RunType.PROTEOMICS,
            created_by=tech_id,
        )
    )

    run_configs = [
        ("PROT-RUN-001", RunType.PROTEOMICS, RunStatus.COMPLETED, instrument_ids[1]),
        ("PROT-RUN-002", RunType.PROTEOMICS, RunStatus.COMPLETED, instrument_ids[1]),
        ("PROT-RUN-003", RunType.PROTEOMICS, RunStatus.IN_PROGRESS, instrument_ids[1]),
        ("MET-RUN-001", RunType.METABOLOMICS, RunStatus.COMPLETED, instrument_ids[2]),
        ("MET-RUN-002", RunType.METABOLOMICS, RunStatus.IN_PROGRESS, instrument_ids[2]),
        ("PREP-RUN-001", RunType.PLATE_PREP, RunStatus.COMPLETED, instrument_ids[0]),
        ("PREP-RUN-002", RunType.PLATE_PREP, RunStatus.COMPLETED, instrument_ids[3]),
        ("PREP-RUN-003", RunType.PLATE_PREP, RunStatus.PLANNED, instrument_ids[0]),
        ("PROT-RUN-004", RunType.PROTEOMICS, RunStatus.FAILED, instrument_ids[1]),
        ("MET-RUN-003", RunType.METABOLOMICS, RunStatus.PLANNED, instrument_ids[2]),
    ]

    # -- Runs --
    run_ids: list[uuid.UUID] = []
    # Track which runs need plates: (run_id, run_name, run_type)
    runs_needing_plates: list[tuple[uuid.UUID, str, RunType]] = []

    for run_name, rtype, rstatus, instr_id in run_configs:
        rid = uuid.uuid4()
        started = _rand_dt(60, 2) if rstatus != RunStatus.PLANNED else None
        completed = (started + timedelta(hours=random.randint(2, 8))) if rstatus == RunStatus.COMPLETED and started else None

        session.add(
            InstrumentRun(
                id=rid,
                instrument_id=instr_id,
                run_name=run_name,
                run_type=rtype,
                status=rstatus,
                started_at=started,
                completed_at=completed,
                operator_id=tech_id,
                method_name=f"{rtype.value}_standard_v2" if rtype else None,
                qc_status=QCStatus.PASSED if rstatus == RunStatus.COMPLETED else (
                    QCStatus.FAILED if rstatus == RunStatus.FAILED else QCStatus.PENDING
                ),
                created_by=tech_id,
            )
        )
        run_ids.append(rid)
        if rstatus in (RunStatus.COMPLETED, RunStatus.IN_PROGRESS):
            runs_needing_plates.append((rid, run_name, rtype))

    await session.flush()  # flush runs before plates (FK)

    # -- Plates --
    avail_samples = list(sample_ids)
    random.shuffle(avail_samples)
    s_cursor = 0
    # Track plates for well assignments: (plate_id, run_id, n_wells)
    plates_for_wells: list[tuple[uuid.UUID, uuid.UUID, int]] = []

    for rid, run_name, rtype in runs_needing_plates:
        plate_id = uuid.uuid4()
        session.add(
            Plate(
                id=plate_id,
                plate_name=f"{run_name}-P1",
                run_id=rid,
                qc_template_id=qc_id if rtype == RunType.PROTEOMICS else None,
                rows=8,
                columns=12,
                created_by=tech_id,
            )
        )
        n_wells = random.randint(10, min(20, len(avail_samples) - s_cursor))
        plates_for_wells.append((plate_id, rid, n_wells))

    await session.flush()  # flush plates before well assignments (FK)

    # -- Well assignments --
    well_rows = "ABCDEFGH"
    for plate_id, rid, n_wells in plates_for_wells:
        for w in range(n_wells):
            if s_cursor >= len(avail_samples):
                break
            wr = well_rows[w // 12]
            wc = (w % 12) + 1
            session.add(
                InstrumentRunSample(
                    id=uuid.uuid4(),
                    run_id=rid,
                    sample_id=avail_samples[s_cursor],
                    plate_id=plate_id,
                    well_position=f"{wr}{wc}",
                    plate_number=1,
                    sample_order=w + 1,
                    injection_volume_ul=Decimal("2.00"),
                )
            )
            s_cursor += 1

    await session.flush()
    print(f"  [instruments] Seeded 5 instruments, 10 runs, plates with well assignments.")
    return run_ids


# ---------------------------------------------------------------------------
# 9. ICC Processing Records
# ---------------------------------------------------------------------------

async def seed_icc(
    session: AsyncSession,
    sample_ids: list[uuid.UUID],
    tech_id: uuid.UUID,
) -> None:
    result = await session.execute(select(func.count()).select_from(IccProcessing))
    count = result.scalar()
    if count and count >= 2:
        print("[icc] Already seeded, skipping.")
        return

    icc_samples = random.sample(sample_ids, min(2, len(sample_ids)))
    statuses = [IccStatus.ANALYSIS_COMPLETE, IccStatus.IMAGING]

    for idx, sid in enumerate(icc_samples):
        session.add(
            IccProcessing(
                id=uuid.uuid4(),
                sample_id=sid,
                status=statuses[idx],
                fixation_reagent="4% PFA in PBS",
                fixation_duration_min=15,
                fixation_datetime=_rand_dt(30, 5),
                antibody_panel="CD3/CD4/CD8/CD19/CD56",
                secondary_antibody="Alexa Fluor 488 Goat anti-Mouse IgG",
                microscope_settings={"objective": "40x", "exposure_ms": 200, "channels": ["DAPI", "FITC", "PE"]},
                analysis_software="Fiji/ImageJ",
                operator_id=tech_id,
                notes="BHARAT Study ICC batch processing" if idx == 0 else "Second ICC batch",
            )
        )

    await session.flush()
    print("  [icc] Seeded 2 ICC processing records.")


# ---------------------------------------------------------------------------
# 10. Omics Results
# ---------------------------------------------------------------------------

async def seed_omics(
    session: AsyncSession,
    run_ids: list[uuid.UUID],
    sample_ids: list[uuid.UUID],
    tech_id: uuid.UUID,
) -> None:
    result = await session.execute(select(func.count()).select_from(OmicsResultSet))
    count = result.scalar()
    if count and count >= 1:
        print("[omics] Already seeded, skipping.")
        return

    # Pick a completed run
    completed_runs = await session.execute(
        select(InstrumentRun.id).where(InstrumentRun.status == RunStatus.COMPLETED).limit(1)
    )
    run_row = completed_runs.first()
    if not run_row:
        print("[omics] No completed runs found, skipping.")
        return

    ors_id = uuid.uuid4()
    session.add(
        OmicsResultSet(
            id=ors_id,
            run_id=run_row[0],
            result_type=OmicsResultType.PROTEOMICS,
            analysis_software="MaxQuant",
            software_version="2.4.3.0",
            import_date=_rand_dt(14, 1),
            imported_by=tech_id,
            source_file_path="/data/nas/proteomics/results/PROT-RUN-001_maxquant.txt",
            total_features=1200,
            total_samples=18,
            qc_summary={"cv_median": 12.3, "missing_pct": 4.2, "proteins_identified": 1200},
        )
    )
    await session.flush()  # flush result set before individual results (FK)

    # Individual results for some features/samples
    proteins = ["ALB", "TNF", "IL6", "CRP", "APOA1", "APOB", "HBA1", "HBB", "TF", "FGA"]
    subset = random.sample(sample_ids, min(10, len(sample_ids)))
    for sid in subset:
        for prot in random.sample(proteins, 5):
            session.add(
                OmicsResult(
                    id=uuid.uuid4(),
                    result_set_id=ors_id,
                    sample_id=sid,
                    feature_id=f"P{random.randint(10000, 99999)}",
                    feature_name=prot,
                    quantification_value=random.uniform(1e4, 1e8),
                    is_imputed=random.random() < 0.1,
                    confidence_score=random.uniform(0.8, 1.0),
                )
            )

    await session.flush()
    print("  [omics] Seeded 1 omics result set with individual results.")


# ---------------------------------------------------------------------------
# 11. Partner Lab Imports & Canonical Tests
# ---------------------------------------------------------------------------

CANONICAL_TESTS = [
    ("hemoglobin", "Hemoglobin", "Hematology", "g/dL", Decimal("12.0"), Decimal("17.0")),
    ("rbc_count", "RBC Count", "Hematology", "million/uL", Decimal("4.0"), Decimal("5.5")),
    ("wbc_count", "WBC Count", "Hematology", "thousand/uL", Decimal("4.0"), Decimal("11.0")),
    ("platelet_count", "Platelet Count", "Hematology", "thousand/uL", Decimal("150"), Decimal("400")),
    ("fasting_glucose", "Fasting Glucose", "Biochemistry", "mg/dL", Decimal("70"), Decimal("110")),
    ("hba1c", "HbA1c", "Biochemistry", "%", Decimal("4.0"), Decimal("5.7")),
    ("total_cholesterol", "Total Cholesterol", "Lipid Panel", "mg/dL", Decimal("0"), Decimal("200")),
    ("hdl_cholesterol", "HDL Cholesterol", "Lipid Panel", "mg/dL", Decimal("40"), Decimal("60")),
    ("ldl_cholesterol", "LDL Cholesterol", "Lipid Panel", "mg/dL", Decimal("0"), Decimal("100")),
    ("triglycerides", "Triglycerides", "Lipid Panel", "mg/dL", Decimal("0"), Decimal("150")),
    ("creatinine", "Creatinine", "Renal Panel", "mg/dL", Decimal("0.6"), Decimal("1.2")),
    ("urea", "Urea", "Renal Panel", "mg/dL", Decimal("15"), Decimal("40")),
    ("tsh", "TSH", "Thyroid", "mIU/L", Decimal("0.4"), Decimal("4.0")),
    ("vitamin_d", "Vitamin D (25-OH)", "Vitamins", "ng/mL", Decimal("30"), Decimal("100")),
    ("vitamin_b12", "Vitamin B12", "Vitamins", "pg/mL", Decimal("200"), Decimal("900")),
]


async def seed_partner_data(
    session: AsyncSession,
    participants: list[tuple[uuid.UUID, str, uuid.UUID]],
    admin_id: uuid.UUID,
) -> None:
    result = await session.execute(select(func.count()).select_from(CanonicalTest))
    count = result.scalar()
    if count and count >= 10:
        print("[partner] Already seeded, skipping.")
        return

    # Canonical tests
    test_ids: dict[str, uuid.UUID] = {}
    alias_data: list[tuple[uuid.UUID, str, str]] = []  # (test_id, display_name, unit)
    for cname, dname, cat, unit, low, high in CANONICAL_TESTS:
        tid = uuid.uuid4()
        session.add(
            CanonicalTest(
                id=tid,
                canonical_name=cname,
                display_name=dname,
                category=cat,
                standard_unit=unit,
                reference_range_low=low,
                reference_range_high=high,
            )
        )
        test_ids[cname] = tid
        alias_data.append((tid, dname, unit))

    await session.flush()  # flush canonical tests before aliases (FK)

    # Add aliases for Healthians
    for tid, dname, unit in alias_data:
        session.add(
            TestNameAlias(
                id=uuid.uuid4(),
                canonical_test_id=tid,
                partner_name=PartnerName.HEALTHIANS,
                alias_name=dname.upper(),
                alias_unit=unit,
                unit_conversion_factor=Decimal("1.0"),
            )
        )

    await session.flush()

    # Partner lab imports (2 imports)
    import_data: list[tuple[uuid.UUID, int]] = []
    for imp_idx in range(2):
        imp_id = uuid.uuid4()
        partner = PartnerName.HEALTHIANS if imp_idx == 0 else PartnerName.LALPATH
        n_records = random.randint(15, 30)
        session.add(
            PartnerLabImport(
                id=imp_id,
                partner_name=partner,
                import_date=_rand_dt(60, 5),
                source_file_name=f"{partner.value}_results_batch_{imp_idx + 1}.xlsx",
                records_total=n_records,
                records_matched=n_records - random.randint(0, 3),
                records_failed=random.randint(0, 2),
                imported_by=admin_id,
                notes=f"Batch {imp_idx + 1} import from {partner.value}",
            )
        )
        import_data.append((imp_id, n_records))

    await session.flush()  # flush imports before results (FK)

    # Generate results
    test_names = list(test_ids.keys())
    for imp_id, n_records in import_data:
        subset = random.sample(participants, min(n_records, len(participants)))
        for p_id, p_code, _ in subset:
            for tname in random.sample(test_names, random.randint(3, 8)):
                low = float(CANONICAL_TESTS[[t[0] for t in CANONICAL_TESTS].index(tname)][4])
                high = float(CANONICAL_TESTS[[t[0] for t in CANONICAL_TESTS].index(tname)][5])
                val = round(random.uniform(low * 0.7, high * 1.3), 2)
                is_abn = val < low or val > high

                session.add(
                    PartnerLabResult(
                        id=uuid.uuid4(),
                        import_id=imp_id,
                        participant_id=p_id,
                        participant_code_raw=p_code,
                        test_date=_rand_date(60, 5),
                        test_name_raw=tname,
                        canonical_test_id=test_ids[tname],
                        test_value=str(val),
                        test_unit=CANONICAL_TESTS[[t[0] for t in CANONICAL_TESTS].index(tname)][3],
                        is_abnormal=is_abn,
                        match_status=MatchStatus.AUTO_MATCHED,
                    )
                )

    await session.flush()
    print(f"  [partner] Seeded {len(CANONICAL_TESTS)} canonical tests, 2 imports with results.")


# ---------------------------------------------------------------------------
# 12. Stool Kits
# ---------------------------------------------------------------------------

async def seed_stool_kits(
    session: AsyncSession,
    participants: list[tuple[uuid.UUID, str, uuid.UUID]],
    field_id: uuid.UUID,
) -> None:
    result = await session.execute(select(func.count()).select_from(StoolKit))
    count = result.scalar()
    if count and count >= 5:
        print("[stool_kits] Already seeded, skipping.")
        return

    kit_statuses = [
        StoolKitStatus.ISSUED,
        StoolKitStatus.PICKUP_SCHEDULED,
        StoolKitStatus.COLLECTED_BY_DECODEAGE,
        StoolKitStatus.PROCESSING,
        StoolKitStatus.RESULTS_RECEIVED,
    ]

    subset = random.sample(participants, min(8, len(participants)))
    for idx, (p_id, p_code, _) in enumerate(subset):
        status = kit_statuses[idx % len(kit_statuses)]
        session.add(
            StoolKit(
                id=uuid.uuid4(),
                participant_id=p_id,
                kit_code=f"SK-{p_code[-4:]}-{idx + 1:03d}",
                issued_at=_rand_dt(60, 5),
                issued_by=field_id,
                status=status,
                decodeage_pickup_date=_rand_date(30, 2) if status.value not in ("issued",) else None,
                results_received_at=_rand_dt(14, 1) if status == StoolKitStatus.RESULTS_RECEIVED else None,
                notes=f"Kit for participant {p_code}",
            )
        )

    await session.flush()
    print(f"  [stool_kits] Seeded {len(subset)} stool kits.")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def run_seed() -> None:
    print("=" * 60)
    print("LIIMS Database Seeder - BHARAT Study at IISc Bangalore")
    print("=" * 60)

    async with async_session_factory() as session:
        # 1. Users
        print("\n[1/9] Seeding users...")
        users = await seed_users(session)
        admin_id = users.get("admin@liims.iisc.ac.in") or list(users.values())[0]
        tech_id = users.get("tech@liims.iisc.ac.in") or admin_id
        field_id = users.get("field@liims.iisc.ac.in") or admin_id

        # 2. System settings
        print("\n[2/9] Seeding system settings...")
        await seed_settings(session)

        # 3. Collection sites
        print("\n[3/9] Seeding collection sites...")
        site_map = await seed_sites(session, admin_id)

        # 4. Participants
        print("\n[4/9] Seeding participants...")
        participants = await seed_participants(session, site_map, admin_id)

        # 5. Samples
        print("\n[5/9] Seeding samples...")
        sample_ids = await seed_samples(session, participants, tech_id)

        # 6. Storage
        print("\n[6/9] Seeding storage (freezers, racks, boxes)...")
        await seed_storage(session, admin_id, sample_ids, tech_id)

        # 7. Field events
        print("\n[7/9] Seeding field events...")
        await seed_field_events(session, site_map, participants, users)

        # 8. Instruments, runs, plates
        print("\n[8/9] Seeding instruments and runs...")
        run_ids = await seed_instruments(session, tech_id, sample_ids)

        # 9. ICC, Omics, Partners, Stool kits
        print("\n[9/9] Seeding ICC, Omics, Partner data, Stool kits...")
        await seed_icc(session, sample_ids, tech_id)
        await seed_omics(session, run_ids, sample_ids, tech_id)
        await seed_partner_data(session, participants, admin_id)
        await seed_stool_kits(session, participants, field_id)

        await session.commit()

    print("\n" + "=" * 60)
    print("Seed complete!")
    print("=" * 60)
    print("\nDemo credentials:")
    for email, pw, name, role in SEED_USERS:
        print(f"  {email:30s}  {pw:12s}  ({role})")


if __name__ == "__main__":
    asyncio.run(run_seed())
