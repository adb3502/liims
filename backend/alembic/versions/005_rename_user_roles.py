"""Rename and expand UserRole enum to match BHARAT study team structure.

Revision ID: 005
Revises: 004
Create Date: 2026-03-12

Renames:
  lab_manager       → lii_pi_researcher
  lab_technician    → scientist
  data_entry        → icmr_car_jrf
  field_coordinator → field_operative
  collaborator      → pi_researcher  (enum value kept same, no DB change needed)

Adds new values:
  icmr_car_postdoc
  clinical_team
  clinical_partner
"""

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # DB stores enum member NAMES (uppercase) due to SQLAlchemy native enum default behavior.
    # We can't ADD VALUE inside a transaction, so instead: cast to text → remap → DROP TYPE
    # → CREATE new type → cast back. All steps run in the same transaction.

    # Step 1: Cast columns to text so we can drop the type
    op.execute('ALTER TABLE "user" ALTER COLUMN role TYPE text')
    op.execute("ALTER TABLE notification ALTER COLUMN recipient_role TYPE text")

    # Step 2: Remap old uppercase names to new uppercase names in text columns
    op.execute("UPDATE \"user\" SET role = 'LII_PI_RESEARCHER' WHERE role = 'LAB_MANAGER'")
    op.execute("UPDATE \"user\" SET role = 'SCIENTIST' WHERE role = 'LAB_TECHNICIAN'")
    op.execute("UPDATE \"user\" SET role = 'ICMR_CAR_JRF' WHERE role = 'DATA_ENTRY'")
    op.execute("UPDATE \"user\" SET role = 'FIELD_OPERATIVE' WHERE role = 'FIELD_COORDINATOR'")
    op.execute("UPDATE \"user\" SET role = 'PI_RESEARCHER' WHERE role = 'COLLABORATOR'")

    op.execute("UPDATE notification SET recipient_role = 'LII_PI_RESEARCHER' WHERE recipient_role = 'LAB_MANAGER'")
    op.execute("UPDATE notification SET recipient_role = 'SCIENTIST' WHERE recipient_role = 'LAB_TECHNICIAN'")
    op.execute("UPDATE notification SET recipient_role = 'ICMR_CAR_JRF' WHERE recipient_role = 'DATA_ENTRY'")
    op.execute("UPDATE notification SET recipient_role = 'FIELD_OPERATIVE' WHERE recipient_role = 'FIELD_COORDINATOR'")
    op.execute("UPDATE notification SET recipient_role = 'PI_RESEARCHER' WHERE recipient_role = 'COLLABORATOR'")

    # Step 3: Drop old enum type (if exists) and create new one with full role set
    op.execute("DROP TYPE IF EXISTS userrole")
    op.execute("""
        CREATE TYPE userrole AS ENUM (
            'SUPER_ADMIN',
            'LII_PI_RESEARCHER',
            'SCIENTIST',
            'ICMR_CAR_JRF',
            'ICMR_CAR_POSTDOC',
            'FIELD_OPERATIVE',
            'CLINICAL_TEAM',
            'CLINICAL_PARTNER',
            'PI_RESEARCHER'
        )
    """)

    # Step 4: Cast columns back to the new enum type
    op.execute('ALTER TABLE "user" ALTER COLUMN role TYPE userrole USING role::userrole')
    op.execute("ALTER TABLE notification ALTER COLUMN recipient_role TYPE userrole USING recipient_role::userrole")


def downgrade() -> None:
    op.execute('ALTER TABLE "user" ALTER COLUMN role TYPE text')
    op.execute("ALTER TABLE notification ALTER COLUMN recipient_role TYPE text")
    op.execute("DROP TYPE IF EXISTS userrole")
    op.execute("""
        CREATE TYPE userrole AS ENUM (
            'SUPER_ADMIN',
            'LAB_MANAGER',
            'LAB_TECHNICIAN',
            'FIELD_COORDINATOR',
            'DATA_ENTRY',
            'COLLABORATOR',
            'PI_RESEARCHER'
        )
    """)
    op.execute("UPDATE \"user\" SET role = 'LAB_MANAGER' WHERE role = 'LII_PI_RESEARCHER'")
    op.execute("UPDATE \"user\" SET role = 'LAB_TECHNICIAN' WHERE role IN ('SCIENTIST', 'ICMR_CAR_POSTDOC')")
    op.execute("UPDATE \"user\" SET role = 'DATA_ENTRY' WHERE role = 'ICMR_CAR_JRF'")
    op.execute("UPDATE \"user\" SET role = 'FIELD_COORDINATOR' WHERE role IN ('FIELD_OPERATIVE', 'CLINICAL_TEAM')")
    op.execute("UPDATE \"user\" SET role = 'COLLABORATOR' WHERE role IN ('CLINICAL_PARTNER', 'PI_RESEARCHER')")
    op.execute('ALTER TABLE "user" ALTER COLUMN role TYPE userrole USING role::userrole')
    op.execute("ALTER TABLE notification ALTER COLUMN recipient_role TYPE userrole USING recipient_role::userrole")
