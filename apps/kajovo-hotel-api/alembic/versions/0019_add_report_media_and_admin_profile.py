"""add report media and admin profile

Revision ID: 0019_add_report_media_and_admin_profile
Revises: 0018_add_device_provisioning_tables
Create Date: 2026-03-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019_add_report_media_and_admin_profile"
down_revision: str | None = "0018_add_device_provisioning_tables"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "report_photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("thumb_path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_report_photos_id", "report_photos", ["id"], unique=False)
    op.create_index("ix_report_photos_report_id", "report_photos", ["report_id"], unique=False)

    op.create_table(
        "admin_profile",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_admin_profile_email", "admin_profile", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_admin_profile_email", table_name="admin_profile")
    op.drop_table("admin_profile")

    op.drop_index("ix_report_photos_report_id", table_name="report_photos")
    op.drop_index("ix_report_photos_id", table_name="report_photos")
    op.drop_table("report_photos")
