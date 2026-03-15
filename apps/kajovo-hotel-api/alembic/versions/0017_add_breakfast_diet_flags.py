"""add breakfast diet flags

Revision ID: 0017_add_breakfast_diet_flags
Revises: 0016_add_lost_found_tags_room
Create Date: 2026-03-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_add_breakfast_diet_flags"
down_revision: str | None = "0016_add_lost_found_tags_room"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "breakfast_orders",
        sa.Column("diet_no_gluten", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "breakfast_orders",
        sa.Column("diet_no_milk", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "breakfast_orders",
        sa.Column("diet_no_pork", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )

    with op.batch_alter_table("breakfast_orders") as batch_op:
        batch_op.alter_column("diet_no_gluten", server_default=None)
        batch_op.alter_column("diet_no_milk", server_default=None)
        batch_op.alter_column("diet_no_pork", server_default=None)


def downgrade() -> None:
    op.drop_column("breakfast_orders", "diet_no_pork")
    op.drop_column("breakfast_orders", "diet_no_milk")
    op.drop_column("breakfast_orders", "diet_no_gluten")
