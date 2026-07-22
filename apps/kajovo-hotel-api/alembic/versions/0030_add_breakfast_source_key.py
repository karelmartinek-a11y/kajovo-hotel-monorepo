"""add breakfast source key for sync identity

Revision ID: 0030_add_breakfast_source_key
Revises: 0029_clear_breakfast_system_notes
Create Date: 2026-07-22 09:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0030_add_breakfast_source_key"
down_revision = "0029_clear_breakfast_system_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("breakfast_orders", sa.Column("source_key", sa.String(length=255), nullable=True))
    op.create_index(
        "ix_breakfast_orders_source_key",
        "breakfast_orders",
        ["source_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_breakfast_orders_source_key", table_name="breakfast_orders")
    op.drop_column("breakfast_orders", "source_key")
