"""Persist reservation-bound housekeeping amenities with optimistic versions."""

import sqlalchemy as sa

from alembic import op

revision = "0031_reservation_amenities"
down_revision = "0030_add_breakfast_source_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reservation_amenities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("reservation_id", sa.String(128), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("updated_by", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("reservation_id", "kind", name="uq_reservation_amenity"),
        sa.CheckConstraint("kind IN ('dog', 'cot')", name="ck_reservation_amenity_kind"),
        sa.CheckConstraint("state IN ('red', 'green')", name="ck_reservation_amenity_state"),
    )
    op.create_index("ix_reservation_amenities_reservation_id", "reservation_amenities", ["reservation_id"])


def downgrade() -> None:
    op.drop_table("reservation_amenities")
