"""add auth lockout state and unlock tokens

Revision ID: 0012_add_auth_lockout_and_unlock_tokens
Revises: 0011_expand_portal_users_multi_role_profile
Create Date: 2026-02-23 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0012_add_auth_lockout_and_unlock_tokens"
down_revision: str | None = "0011_expand_portal_users_multi_role_profile"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auth_lockout_states",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_type", sa.String(length=16), nullable=False),
        sa.Column("principal", sa.String(length=255), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("first_failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_forgot_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_auth_lockout_states_id"), "auth_lockout_states", ["id"], unique=False)
    op.create_index(op.f("ix_auth_lockout_states_actor_type"), "auth_lockout_states", ["actor_type"], unique=False)
    op.create_index(op.f("ix_auth_lockout_states_principal"), "auth_lockout_states", ["principal"], unique=False)
    op.create_unique_constraint("uq_auth_lockout_actor_principal", "auth_lockout_states", ["actor_type", "principal"])

    op.create_table(
        "auth_unlock_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_type", sa.String(length=16), nullable=False),
        sa.Column("principal", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_auth_unlock_tokens_id"), "auth_unlock_tokens", ["id"], unique=False)
    op.create_index(op.f("ix_auth_unlock_tokens_actor_type"), "auth_unlock_tokens", ["actor_type"], unique=False)
    op.create_index(op.f("ix_auth_unlock_tokens_principal"), "auth_unlock_tokens", ["principal"], unique=False)
    op.create_index(op.f("ix_auth_unlock_tokens_token_hash"), "auth_unlock_tokens", ["token_hash"], unique=True)
    op.create_index(op.f("ix_auth_unlock_tokens_expires_at"), "auth_unlock_tokens", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_unlock_tokens_expires_at"), table_name="auth_unlock_tokens")
    op.drop_index(op.f("ix_auth_unlock_tokens_token_hash"), table_name="auth_unlock_tokens")
    op.drop_index(op.f("ix_auth_unlock_tokens_principal"), table_name="auth_unlock_tokens")
    op.drop_index(op.f("ix_auth_unlock_tokens_actor_type"), table_name="auth_unlock_tokens")
    op.drop_index(op.f("ix_auth_unlock_tokens_id"), table_name="auth_unlock_tokens")
    op.drop_table("auth_unlock_tokens")

    op.drop_constraint("uq_auth_lockout_actor_principal", "auth_lockout_states", type_="unique")
    op.drop_index(op.f("ix_auth_lockout_states_principal"), table_name="auth_lockout_states")
    op.drop_index(op.f("ix_auth_lockout_states_actor_type"), table_name="auth_lockout_states")
    op.drop_index(op.f("ix_auth_lockout_states_id"), table_name="auth_lockout_states")
    op.drop_table("auth_lockout_states")
