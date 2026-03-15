"""add smtp delivery flags

Revision ID: 0022_add_smtp_delivery_flags
Revises: 0021_add_smtp_test_tracking
Create Date: 2026-03-15 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0022_add_smtp_delivery_flags"
down_revision: str | None = "0021_add_smtp_test_tracking"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "portal_smtp_settings",
        sa.Column("last_test_connected", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "portal_smtp_settings",
        sa.Column("last_test_send_attempted", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("portal_smtp_settings", "last_test_send_attempted")
    op.drop_column("portal_smtp_settings", "last_test_connected")
