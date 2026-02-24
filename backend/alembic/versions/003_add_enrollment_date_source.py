"""Add enrollment_date_source column to participant (schema only).

Revision ID: 003
Revises: 002
Create Date: 2026-02-24

Step (a) of two-step enrollment date migration.
Step (b) backfill is in revision 004.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "participant",
        sa.Column(
            "enrollment_date_source",
            sa.String(50),
            nullable=True,
            comment="Audit trail: backfill_lab_date | backfill_odk | manual | bulk_import",
        ),
    )


def downgrade() -> None:
    op.drop_column("participant", "enrollment_date_source")
