"""Fix userrole column back to VARCHAR to match Python enum lowercase values.

Revision ID: 007
Revises: 006
Create Date: 2026-03-16

Migration 005 created a PostgreSQL native ENUM type 'userrole' with uppercase
values (e.g. 'SUPER_ADMIN'), but the Python UserRole enum uses lowercase values
(e.g. 'super_admin'). On a fresh database this causes DatatypeMismatchError on
every INSERT. This migration converts the column back to VARCHAR(50), which is
what migration 001 originally created and what all other enum columns use.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Cast role columns back to VARCHAR (drops the native enum type dependency)
    conn.execute(text('ALTER TABLE "user" ALTER COLUMN role TYPE VARCHAR(50)'))
    conn.execute(text("ALTER TABLE notification ALTER COLUMN recipient_role TYPE VARCHAR(50)"))
    conn.execute(text("DROP TYPE IF EXISTS userrole"))


def downgrade() -> None:
    # No-op: reverting to a broken state is not useful
    pass
