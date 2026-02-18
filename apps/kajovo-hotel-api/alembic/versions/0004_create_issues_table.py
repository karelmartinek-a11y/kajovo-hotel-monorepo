"""create issues table

Revision ID: 0004_create_issues_table
Revises: 0003_create_lost_found_items_table
Create Date: 2026-02-18 11:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_create_issues_table"
down_revision: str | None = "0003_create_lost_found_items_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "issues",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column("room_number", sa.String(length=32), nullable=True),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="new"),
        sa.Column("assignee", sa.String(length=255), nullable=True),
        sa.Column("in_progress_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_issues_id"), "issues", ["id"], unique=False)
    op.create_index(op.f("ix_issues_location"), "issues", ["location"], unique=False)
    op.create_index(op.f("ix_issues_priority"), "issues", ["priority"], unique=False)
    op.create_index(op.f("ix_issues_room_number"), "issues", ["room_number"], unique=False)
    op.create_index(op.f("ix_issues_status"), "issues", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_issues_status"), table_name="issues")
    op.drop_index(op.f("ix_issues_room_number"), table_name="issues")
    op.drop_index(op.f("ix_issues_priority"), table_name="issues")
    op.drop_index(op.f("ix_issues_location"), table_name="issues")
    op.drop_index(op.f("ix_issues_id"), table_name="issues")
    op.drop_table("issues")
