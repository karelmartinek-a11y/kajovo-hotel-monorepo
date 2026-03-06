"""add lost found tags and room number

Revision ID: 0016_add_lost_found_tags_room
Revises: 0015_inventory_documents
Create Date: 2026-03-06
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0016_add_lost_found_tags_room"
down_revision: str | None = "0015_inventory_documents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("lost_found_items", sa.Column("room_number", sa.String(length=32), nullable=True))
    op.add_column(
        "lost_found_items",
        sa.Column("tags_json", sa.Text(), nullable=False, server_default="[]"),
    )
    op.create_index(
        op.f("ix_lost_found_items_room_number"),
        "lost_found_items",
        ["room_number"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_lost_found_items_room_number"), table_name="lost_found_items")
    op.drop_column("lost_found_items", "tags_json")
    op.drop_column("lost_found_items", "room_number")
