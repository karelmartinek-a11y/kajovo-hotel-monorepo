"""create breakfast orders table

Revision ID: 0002_create_breakfast_orders_table
Revises: 0001_create_reports_table
Create Date: 2026-02-18 00:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_create_breakfast_orders_table"
down_revision: str | None = "0001_create_reports_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "breakfast_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("room_number", sa.String(length=32), nullable=False),
        sa.Column("guest_name", sa.String(length=255), nullable=False),
        sa.Column("guest_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_breakfast_orders_id"), "breakfast_orders", ["id"], unique=False)
    op.create_index(
        op.f("ix_breakfast_orders_service_date"), "breakfast_orders", ["service_date"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_breakfast_orders_service_date"), table_name="breakfast_orders")
    op.drop_index(op.f("ix_breakfast_orders_id"), table_name="breakfast_orders")
    op.drop_table("breakfast_orders")
