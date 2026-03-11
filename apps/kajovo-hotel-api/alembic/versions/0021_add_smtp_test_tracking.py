"""add smtp test tracking

Revision ID: 0021_add_smtp_test_tracking
Revises: 0020_add_devices
Create Date: 2026-03-11 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0021_add_smtp_test_tracking"
down_revision: str | None = "0020_add_devices"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "portal_smtp_settings",
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "portal_smtp_settings",
        sa.Column("last_test_success", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "portal_smtp_settings",
        sa.Column("last_test_recipient", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "portal_smtp_settings",
        sa.Column("last_test_error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("portal_smtp_settings", "last_test_error")
    op.drop_column("portal_smtp_settings", "last_test_recipient")
    op.drop_column("portal_smtp_settings", "last_test_success")
    op.drop_column("portal_smtp_settings", "last_tested_at")
