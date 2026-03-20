"""Add trigger_type column to odk_sync_log.

Revision ID: 006
Revises: 005
Create Date: 2026-03-13
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "odk_sync_log",
        sa.Column(
            "trigger_type",
            sa.String(length=20),
            nullable=False,
            server_default="manual",
        ),
    )


def downgrade() -> None:
    op.drop_column("odk_sync_log", "trigger_type")
