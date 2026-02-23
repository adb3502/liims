"""Seed the LIIMS database with foundational data for the Longevity India (BHARAT) Study.

Seeds ONLY reference data needed to start the application:
- Admin user account
- Real collection sites
- System settings
- Canonical lab tests for partner lab imports

All operational data (participants, samples, storage, etc.) is created
through the application UI during normal operations.

Idempotent: checks for existing data before inserting.
Run via: python -m app.seed
"""

import asyncio
import uuid
from datetime import timedelta, timezone
from decimal import Decimal

import bcrypt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_factory
from app.models.enums import SettingValueType
from app.models.participant import CollectionSite
from app.models.partner import CanonicalTest, TestNameAlias
from app.models.enums import PartnerName
from app.models.system import SystemSetting
from app.models.user import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

IST = timezone(timedelta(hours=5, minutes=30))


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


# ---------------------------------------------------------------------------
# 1. Admin User
# ---------------------------------------------------------------------------

async def seed_admin(session: AsyncSession) -> uuid.UUID:
    """Create the admin user. Returns admin user ID."""
    result = await session.execute(
        select(User).where(User.email == "amruthbhat@iisc.ac.in")
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        print("[admin] Already exists, skipping.")
        return existing.id

    uid = uuid.uuid4()
    session.add(
        User(
            id=uid,
            email="amruthbhat@iisc.ac.in",
            password_hash=_hash("Admin@123"),
            full_name="Amruth Bhat",
            role="super_admin",
            is_active=True,
        )
    )
    await session.flush()
    print("  [admin] Created amruthbhat@iisc.ac.in (super_admin)")
    return uid


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
    (
        "study",
        "participant_code_format",
        '{"pattern":"{age_group}{sex}-{number:03d}","age_groups":{"1":"18-29","2":"30-44","3":"45-59","4":"60-74","5":"75+"},"sex_codes":{"A":"Male","B":"Female"},"number_range":"001-999"}',
        SettingValueType.JSON,
        "Participant code format: {age_group}{sex}-{number} e.g. 1A-001",
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
# 3. Collection Sites (Real Longevity India study sites)
# ---------------------------------------------------------------------------
#
# Participant codes use the format: {age_group}{sex}-{number}
#   age_group: 1=18-29, 2=30-44, 3=45-59, 4=60-74, 5=75+
#   sex: A=Male, B=Female
#   number: 001-999
#
# Sites do not have formal site codes in the study protocol.
# Short codes below are for internal LIIMS use only.

SITES = [
    # (name, code, city, address, is_active, range_start, range_end)
    (
        "M.S. Ramaiah Memorial Hospital",
        "RMH",
        "Bengaluru",
        "New BEL Road, MSR Nagar, Bengaluru, Karnataka 560054",
        True, 1, 9999,
    ),
    (
        "Bangalore Baptist Hospital",
        "BBH",
        "Bengaluru",
        "Bellary Road, Hebbal, Bengaluru, Karnataka 560024",
        True, 10000, 19999,
    ),
    (
        "Sri Sathya Sai Sarla Memorial Hospital",
        "SSSSMH",
        "Chikkaballapur",
        "Sathya Sai Grama, Muddenahalli, Chikkaballapur, Karnataka 562101",
        True, 20000, 29999,
    ),
    (
        "Bangalore Medical College & Research Institute",
        "BMC",
        "Bengaluru",
        "Fort Road, Kalasipalayam, Bengaluru, Karnataka 560002",
        False, 30000, 39999,  # not active yet
    ),
    (
        "Command Hospital Air Force",
        "CHAF",
        "Bengaluru",
        "Old Airport Road, Agram Post, Bengaluru, Karnataka 560007",
        True, 40000, 49999,
    ),
    (
        "JSS Hospital, Mysuru",
        "JSS",
        "Mysuru",
        "Mahatma Gandhi Road, Mysuru, Karnataka 570004",
        False, 50000, 59999,  # not active yet
    ),
]


async def seed_sites(session: AsyncSession, admin_id: uuid.UUID) -> None:
    result = await session.execute(
        select(CollectionSite).where(CollectionSite.code == SITES[0][1])
    )
    if result.scalar_one_or_none() is not None:
        print("[sites] Already seeded, skipping.")
        return

    for name, code, city, addr, is_active, rstart, rend in SITES:
        session.add(
            CollectionSite(
                id=uuid.uuid4(),
                name=name,
                code=code,
                participant_range_start=rstart,
                participant_range_end=rend,
                city=city,
                address=addr,
                is_active=is_active,
                created_by=admin_id,
            )
        )
        status = "active" if is_active else "inactive"
        print(f"  [sites] Created {code}: {name} ({status})")
    await session.flush()


# ---------------------------------------------------------------------------
# 4. Canonical Lab Tests (real reference ranges for partner lab imports)
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


async def seed_canonical_tests(session: AsyncSession) -> None:
    result = await session.execute(select(CanonicalTest).limit(1))
    if result.scalar_one_or_none() is not None:
        print("[canonical_tests] Already seeded, skipping.")
        return

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
        # Add aliases for partner labs
        for partner in [PartnerName.HEALTHIANS, PartnerName.LALPATH]:
            session.add(
                TestNameAlias(
                    id=uuid.uuid4(),
                    canonical_test_id=tid,
                    partner_name=partner,
                    alias_name=dname.upper(),
                    alias_unit=unit,
                    unit_conversion_factor=Decimal("1.0"),
                )
            )

    await session.flush()
    print(f"  [canonical_tests] Seeded {len(CANONICAL_TESTS)} tests with partner aliases.")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def run_seed() -> None:
    print("=" * 60)
    print("LIIMS Database Seeder - Longevity India (BHARAT) Study")
    print("=" * 60)

    async with async_session_factory() as session:
        # 1. Admin user
        print("\n[1/4] Seeding admin user...")
        admin_id = await seed_admin(session)

        # 2. System settings
        print("\n[2/4] Seeding system settings...")
        await seed_settings(session)

        # 3. Collection sites
        print("\n[3/4] Seeding collection sites...")
        await seed_sites(session, admin_id)

        # 4. Canonical lab tests
        print("\n[4/4] Seeding canonical lab tests...")
        await seed_canonical_tests(session)

        await session.commit()

    print("\n" + "=" * 60)
    print("Seed complete!")
    print("=" * 60)
    print("\nAdmin credentials:")
    print("  amruthbhat@iisc.ac.in  /  Admin@123  (super_admin)")
    print("\nCollection sites seeded:")
    for name, code, city, _, is_active, _, _ in SITES:
        status = "" if is_active else " [not yet active]"
        print(f"  {code:8s} {name} ({city}){status}")
    print("\nAll other data (participants, samples, storage, etc.)")
    print("should be created through the application.")


if __name__ == "__main__":
    asyncio.run(run_seed())
