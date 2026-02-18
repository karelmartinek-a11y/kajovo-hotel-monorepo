"""create audit trail table

Revision ID: 0007_create_audit_trail_table
Revises: 0006_add_updated_at_to_reports
Create Date: 2026-02-18 13:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_create_audit_trail_table"
down_revision: str | None = "0006_add_updated_at_to_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_trail",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=False),
        sa.Column("actor", sa.String(length=255), nullable=False),
        sa.Column("module", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("resource", sa.String(length=255), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_trail_id"), "audit_trail", ["id"], unique=False)
    op.create_index(op.f("ix_audit_trail_request_id"), "audit_trail", ["request_id"], unique=False)
    op.create_index(op.f("ix_audit_trail_actor"), "audit_trail", ["actor"], unique=False)
    op.create_index(op.f("ix_audit_trail_module"), "audit_trail", ["module"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_trail_module"), table_name="audit_trail")
    op.drop_index(op.f("ix_audit_trail_actor"), table_name="audit_trail")
    op.drop_index(op.f("ix_audit_trail_request_id"), table_name="audit_trail")
    op.drop_index(op.f("ix_audit_trail_id"), table_name="audit_trail")
    op.drop_table("audit_trail")
