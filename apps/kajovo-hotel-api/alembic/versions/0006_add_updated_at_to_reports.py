"""add updated_at to reports

Revision ID: 0006_add_updated_at_to_reports
Revises: 0005_create_inventory_tables
Create Date: 2026-02-18 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_add_updated_at_to_reports"
down_revision: str | None = "0005_create_inventory_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("reports", "updated_at")
