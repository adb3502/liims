"""Convert all PostgreSQL native enum columns to VARCHAR(50).

Revision ID: 008
Revises: 007
Create Date: 2026-03-20

The original schema was created via SQLAlchemy create_all() which created
PostgreSQL native enum types for all Python enum columns. The Alembic migrations
(001+) use sa.String() instead, creating a mismatch on fresh installs where
pg_restore brings back the old native enum types.

This migration converts all remaining native enum columns to VARCHAR(50) and
lowercases their values to match the Python enum string values.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, column) pairs that may still be native enum types
# NOTE: age_group is INTEGER (AgeGroup is int enum) — handled separately below
# NOTE: sex is VARCHAR(1) per migration 001 — handled separately below
ENUM_COLUMNS = [
    ("participant", "enrollment_source"),
    ("audit_log", "action"),
    ("storage_box", "box_material"),
    ("storage_box", "box_type"),
    ("consent", "consent_type"),
    ("dashboard_cache", "dashboard_type"),
    ("sample_discard_request", "reason"),
    ("sample_discard_request", "status"),
    ("field_event", "status"),
    ("field_event", "event_type"),
    ("field_event", "partner_lab"),
    ("watch_directory", "category"),
    ("managed_file", "category"),
    ("freezer_temperature_event", "event_type"),
    ("freezer", "freezer_type"),
    ("icc_processing", "status"),
    ("instrument", "instrument_type"),
    ("partner_lab_result", "match_status"),
    ("notification", "severity"),
    ("notification", "notification_type"),
    ("notification", "recipient_role"),
    ("odk_submission", "processing_status"),
    ("odk_sync_log", "status"),
    ("omics_result_set", "result_type"),
    ("partner_lab_import", "partner_name"),
    ("test_name_alias", "partner_name"),
    ("instrument_run", "qc_status"),
    ("instrument_run", "status"),
    ("instrument_run", "run_type"),
    ("qc_template", "run_type"),
    ("sample", "status"),
    ("sample", "sample_type"),
    ("sample_status_history", "previous_status"),
    ("sample_status_history", "new_status"),
    ("scheduled_report", "report_type"),
    ("system_setting", "value_type"),
    ("stool_kit", "status"),
    ("field_event_participant", "sync_status"),
    ("sample_transport", "transport_type"),
]

ENUM_TYPES = [
    "agegroup", "auditaction", "boxmaterial", "boxtype", "consenttype",
    "dashboardtype", "discardreason", "discardrequeststatus", "enrollmentsource",
    "fieldeventstatus", "fieldeventtype", "filecategory", "freezereventtype",
    "freezertype", "iccstatus", "instrumenttype", "matchstatus",
    "notificationseverity", "notificationtype", "odkprocessingstatus",
    "odksyncstatus", "omicsresulttype", "partnername", "qcstatus",
    "reporttype", "runstatus", "runtype", "samplestatus", "sampletype",
    "settingvaluetype", "sex", "stoolkitstatus", "syncstatus", "transporttype",
]


def upgrade() -> None:
    conn = op.get_bind()

    # Convert any remaining native enum columns to VARCHAR(50)
    for table, column in ENUM_COLUMNS:
        conn.execute(text(
            f'ALTER TABLE {table} ALTER COLUMN {column} TYPE VARCHAR(50)'
        ))

    # age_group: AgeGroup is int enum (values 1-5), column must be INTEGER
    # Old schema stored strings like 'age_18_29' — map to integers first
    conn.execute(text("UPDATE participant SET age_group = '1' WHERE age_group = 'age_18_29' OR age_group = 'AGE_18_29'"))
    conn.execute(text("UPDATE participant SET age_group = '2' WHERE age_group = 'age_30_44' OR age_group = 'AGE_30_44'"))
    conn.execute(text("UPDATE participant SET age_group = '3' WHERE age_group = 'age_45_59' OR age_group = 'AGE_45_59'"))
    conn.execute(text("UPDATE participant SET age_group = '4' WHERE age_group = 'age_60_74' OR age_group = 'AGE_60_74'"))
    conn.execute(text("UPDATE participant SET age_group = '5' WHERE age_group = 'age_75_plus' OR age_group = 'AGE_75_PLUS'"))
    conn.execute(text("ALTER TABLE participant ALTER COLUMN age_group TYPE INTEGER USING age_group::INTEGER"))

    # sex: Sex enum uses 'M'/'F', old schema stored 'male'/'female' or 'MALE'/'FEMALE' or 'm'/'f'
    conn.execute(text("UPDATE participant SET sex = 'M' WHERE LOWER(sex) = 'male' OR sex = 'm'"))
    conn.execute(text("UPDATE participant SET sex = 'F' WHERE LOWER(sex) = 'female' OR sex = 'f'"))
    conn.execute(text("ALTER TABLE participant ALTER COLUMN sex TYPE VARCHAR(1)"))

    # Drop orphaned enum types
    for enum_type in ENUM_TYPES:
        conn.execute(text(f"DROP TYPE IF EXISTS {enum_type} CASCADE"))

    # Lowercase all enum values to match Python enum string values
    for table, column in ENUM_COLUMNS:
        conn.execute(text(
            f"UPDATE {table} SET {column} = LOWER({column})"
            f" WHERE {column} IS NOT NULL AND {column} != LOWER({column})"
        ))


def downgrade() -> None:
    pass  # Cannot recreate native enum types with original data safely
