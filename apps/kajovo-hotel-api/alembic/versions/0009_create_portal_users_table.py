"""create portal users table

Revision ID: 0009
Revises: 0008
Create Date: 2026-02-26 00:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision = "0009_create_portal_users_table"
down_revision = "0008_portal_users_smtp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portal_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
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
    op.create_index(op.f("ix_portal_users_email"), "portal_users", ["email"], unique=True)
    op.create_index(op.f("ix_portal_users_id"), "portal_users", ["id"], unique=False)
    op.create_index(op.f("ix_portal_users_role"), "portal_users", ["role"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_portal_users_role"), table_name="portal_users")
    op.drop_index(op.f("ix_portal_users_id"), table_name="portal_users")
    op.drop_index(op.f("ix_portal_users_email"), table_name="portal_users")
    op.drop_table("portal_users")
