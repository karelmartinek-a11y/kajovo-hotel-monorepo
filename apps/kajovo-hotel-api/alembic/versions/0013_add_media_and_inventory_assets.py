"""add media tables and inventory pictogram fields

Revision ID: 0013_add_media_and_inventory_assets
Revises: 0012_add_auth_lockout_and_unlock_tokens
Create Date: 2026-03-01 03:30:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0013_add_media_and_inventory_assets"
down_revision: str | None = "0012_add_auth_lockout_and_unlock_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "inventory_items",
        sa.Column("amount_per_piece_base", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("inventory_items", sa.Column("pictogram_path", sa.String(length=512), nullable=True))
    op.add_column("inventory_items", sa.Column("pictogram_thumb_path", sa.String(length=512), nullable=True))

    op.create_table(
        "issue_photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("issue_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("thumb_path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False, server_default="image/jpeg"),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["issue_id"], ["issues.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_issue_photos_id"), "issue_photos", ["id"], unique=False)
    op.create_index(op.f("ix_issue_photos_issue_id"), "issue_photos", ["issue_id"], unique=False)

    op.create_table(
        "lost_found_photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("file_path", sa.String(length=512), nullable=False),
        sa.Column("thumb_path", sa.String(length=512), nullable=False),
        sa.Column("mime_type", sa.String(length=80), nullable=False, server_default="image/jpeg"),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["item_id"], ["lost_found_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lost_found_photos_id"), "lost_found_photos", ["id"], unique=False)
    op.create_index(op.f("ix_lost_found_photos_item_id"), "lost_found_photos", ["item_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lost_found_photos_item_id"), table_name="lost_found_photos")
    op.drop_index(op.f("ix_lost_found_photos_id"), table_name="lost_found_photos")
    op.drop_table("lost_found_photos")

    op.drop_index(op.f("ix_issue_photos_issue_id"), table_name="issue_photos")
    op.drop_index(op.f("ix_issue_photos_id"), table_name="issue_photos")
    op.drop_table("issue_photos")

    op.drop_column("inventory_items", "pictogram_thumb_path")
    op.drop_column("inventory_items", "pictogram_path")
    op.drop_column("inventory_items", "amount_per_piece_base")
