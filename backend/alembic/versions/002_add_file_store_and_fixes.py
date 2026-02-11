"""Add managed_file, watch_directory tables and fix schema gaps.

Revision ID: 002
Revises: 001
Create Date: 2026-02-12

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Managed File ---

    op.create_table(
        "managed_file",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("file_path", sa.String(1000), nullable=False, unique=True),
        sa.Column("file_name", sa.String(500), nullable=False),
        sa.Column("file_size", sa.BigInteger, nullable=False),
        sa.Column("mime_type", sa.String(200), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("instrument_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("instrument.id"), nullable=True),
        sa.Column("discovered_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("processed", sa.Boolean, server_default="false"),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entity_type", sa.String(100), nullable=True),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_managed_file_category", "managed_file", ["category"])
    op.create_index("ix_managed_file_instrument", "managed_file", ["instrument_id"])
    op.create_index("ix_managed_file_entity", "managed_file", ["entity_type", "entity_id"])
    op.create_index("ix_managed_file_checksum", "managed_file", ["checksum_sha256"])
    op.create_index("ix_managed_file_discovered", "managed_file", ["discovered_at"])

    # --- Watch Directory ---

    op.create_table(
        "watch_directory",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("path", sa.String(1000), nullable=False, unique=True),
        sa.Column("instrument_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("instrument.id"), nullable=True),
        sa.Column("file_pattern", sa.String(200), server_default="*"),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("last_scanned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- Fix scheduled_report: rename 'schedule' -> 'schedule_cron', add 'filters' ---

    op.alter_column("scheduled_report", "schedule", new_column_name="schedule_cron")
    op.add_column("scheduled_report", sa.Column("filters", postgresql.JSONB, nullable=True))

    # --- Fix plate: add is_deleted column ---

    op.add_column("plate", sa.Column("is_deleted", sa.Boolean, server_default="false"))


def downgrade() -> None:
    op.drop_column("plate", "is_deleted")
    op.drop_column("scheduled_report", "filters")
    op.alter_column("scheduled_report", "schedule_cron", new_column_name="schedule")
    op.drop_table("watch_directory")
    op.drop_table("managed_file")
