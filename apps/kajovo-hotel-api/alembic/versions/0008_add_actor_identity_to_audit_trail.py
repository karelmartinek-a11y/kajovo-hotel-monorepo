"""add actor identity to audit trail

Revision ID: 0008_add_actor_identity_to_audit_trail
Revises: 0007_create_audit_trail_table
Create Date: 2026-02-18 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_add_actor_identity_to_audit_trail"
down_revision: str | None = "0007_create_audit_trail_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "audit_trail",
        sa.Column("actor_id", sa.String(length=255), nullable=False, server_default="anonymous"),
    )
    op.add_column(
        "audit_trail",
        sa.Column("actor_role", sa.String(length=64), nullable=False, server_default="manager"),
    )
    op.create_index(op.f("ix_audit_trail_actor_id"), "audit_trail", ["actor_id"], unique=False)
    op.create_index(op.f("ix_audit_trail_actor_role"), "audit_trail", ["actor_role"], unique=False)
    op.alter_column("audit_trail", "actor_id", server_default=None)
    op.alter_column("audit_trail", "actor_role", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_trail_actor_role"), table_name="audit_trail")
    op.drop_index(op.f("ix_audit_trail_actor_id"), table_name="audit_trail")
    op.drop_column("audit_trail", "actor_role")
    op.drop_column("audit_trail", "actor_id")
