"""add auth sessions

Revision ID: 0018_add_auth_sessions
Revises: 0017_add_breakfast_diet_flags
Create Date: 2026-03-11 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0018_add_auth_sessions"
down_revision: str | None = "0017_add_breakfast_diet_flags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(length=128), nullable=False),
        sa.Column("actor_type", sa.String(length=16), nullable=False),
        sa.Column("principal", sa.String(length=255), nullable=False),
        sa.Column("portal_user_id", sa.Integer(), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("roles_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("active_role", sa.String(length=32), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["portal_user_id"], ["portal_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_auth_sessions_id"), "auth_sessions", ["id"], unique=False)
    op.create_index(op.f("ix_auth_sessions_session_id"), "auth_sessions", ["session_id"], unique=True)
    op.create_index(op.f("ix_auth_sessions_actor_type"), "auth_sessions", ["actor_type"], unique=False)
    op.create_index(op.f("ix_auth_sessions_principal"), "auth_sessions", ["principal"], unique=False)
    op.create_index(op.f("ix_auth_sessions_portal_user_id"), "auth_sessions", ["portal_user_id"], unique=False)
    op.create_index(op.f("ix_auth_sessions_expires_at"), "auth_sessions", ["expires_at"], unique=False)
    op.create_index(op.f("ix_auth_sessions_revoked_at"), "auth_sessions", ["revoked_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_sessions_revoked_at"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_expires_at"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_portal_user_id"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_principal"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_actor_type"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_session_id"), table_name="auth_sessions")
    op.drop_index(op.f("ix_auth_sessions_id"), table_name="auth_sessions")
    op.drop_table("auth_sessions")
