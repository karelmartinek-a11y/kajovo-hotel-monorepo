"""add report photos

Revision ID: 0019_add_report_photos
Revises: 0018_add_auth_sessions
Create Date: 2026-03-11 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0019_add_report_photos"
down_revision: str | None = "0018_add_auth_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "report_photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("thumb_path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False, server_default="image/jpeg"),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_report_photos_id"), "report_photos", ["id"], unique=False)
    op.create_index(op.f("ix_report_photos_report_id"), "report_photos", ["report_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_report_photos_report_id"), table_name="report_photos")
    op.drop_index(op.f("ix_report_photos_id"), table_name="report_photos")
    op.drop_table("report_photos")
