"""Backfill participant.enrollment_date from earliest lab test date.

Revision ID: 004
Revises: 003
Create Date: 2026-02-24

Step (b) of two-step enrollment date migration.
Step (a) schema migration is in revision 003.

Logic (priority order):
  1. MIN(partner_lab_result.test_date) for the participant
     → sets enrollment_date_source = 'backfill_lab_date'
  2. MIN(odk_submission.created_at) linked to participant where step 1 has no data
     → sets enrollment_date_source = 'backfill_odk'
  3. Remaining participants (no evidence)
     → sets enrollment_date_source = 'bulk_import' (enrollment_date unchanged)

Only updates participants whose enrollment_date_source IS NULL (i.e., not yet
processed). Re-running is safe — already-backfilled rows are skipped.

Use enrollment_date_source = 'backfill_lab_date' as the predicate to identify
rows updated by this migration in subsequent queries or audits.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Step 1: Update from earliest lab result test_date
    conn.execute(
        """
        UPDATE participant p
        SET
            enrollment_date = (
                SELECT CAST(MIN(plr.test_date) AS TIMESTAMP WITH TIME ZONE)
                FROM partner_lab_result plr
                WHERE plr.participant_id = p.id
                  AND plr.test_date IS NOT NULL
            ),
            enrollment_date_source = 'backfill_lab_date'
        WHERE
            p.is_deleted = false
            AND p.enrollment_date_source IS NULL
            AND EXISTS (
                SELECT 1
                FROM partner_lab_result plr
                WHERE plr.participant_id = p.id
                  AND plr.test_date IS NOT NULL
            )
        """
    )

    # Step 2: Update from earliest ODK submission for those still without source
    conn.execute(
        """
        UPDATE participant p
        SET
            enrollment_date = (
                SELECT MIN(os.created_at)
                FROM odk_submission os
                WHERE os.participant_id = p.id
            ),
            enrollment_date_source = 'backfill_odk'
        WHERE
            p.is_deleted = false
            AND p.enrollment_date_source IS NULL
            AND EXISTS (
                SELECT 1
                FROM odk_submission os
                WHERE os.participant_id = p.id
            )
        """
    )

    # Step 3: Mark remaining as bulk_import (enrollment_date unchanged)
    conn.execute(
        """
        UPDATE participant
        SET enrollment_date_source = 'bulk_import'
        WHERE
            is_deleted = false
            AND enrollment_date_source IS NULL
        """
    )


def downgrade() -> None:
    # Clear the source field; enrollment_date cannot be reliably reversed
    conn = op.get_bind()
    conn.execute(
        """
        UPDATE participant
        SET enrollment_date_source = NULL
        WHERE enrollment_date_source IN ('backfill_lab_date', 'backfill_odk', 'bulk_import')
        """
    )
