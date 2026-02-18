"""create lost found items table

Revision ID: 0003_create_lost_found_items_table
Revises: 0002_create_breakfast_orders_table
Create Date: 2026-02-18 09:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_create_lost_found_items_table"
down_revision: str | None = "0002_create_breakfast_orders_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "lost_found_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_type", sa.String(length=16), nullable=False, server_default="found"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="stored"),
        sa.Column("claimant_name", sa.String(length=255), nullable=True),
        sa.Column("claimant_contact", sa.String(length=255), nullable=True),
        sa.Column("handover_note", sa.Text(), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lost_found_items_id"), "lost_found_items", ["id"], unique=False)
    op.create_index(
        op.f("ix_lost_found_items_event_at"),
        "lost_found_items",
        ["event_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_lost_found_items_event_at"), table_name="lost_found_items")
    op.drop_index(op.f("ix_lost_found_items_id"), table_name="lost_found_items")
    op.drop_table("lost_found_items")
