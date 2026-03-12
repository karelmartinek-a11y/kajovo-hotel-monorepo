"""add device provisioning tables

Revision ID: 0018_add_device_provisioning_tables
Revises: 0017_add_breakfast_diet_flags
Create Date: 2026-03-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_add_device_provisioning_tables"
down_revision: str | None = "0017_add_breakfast_diet_flags"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "device_registrations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("secret_hash", sa.String(length=128), nullable=False),
        sa.Column("registered_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_id"),
    )
    op.create_index("ix_device_registrations_id", "device_registrations", ["id"], unique=False)
    op.create_index("ix_device_registrations_device_id", "device_registrations", ["device_id"], unique=True)
    op.create_index("ix_device_registrations_status", "device_registrations", ["status"], unique=False)

    op.create_table(
        "device_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("challenge_id", sa.String(length=64), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("challenge", sa.String(length=128), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("challenge_id"),
    )
    op.create_index("ix_device_challenges_id", "device_challenges", ["id"], unique=False)
    op.create_index("ix_device_challenges_challenge_id", "device_challenges", ["challenge_id"], unique=True)
    op.create_index("ix_device_challenges_device_id", "device_challenges", ["device_id"], unique=False)
    op.create_index("ix_device_challenges_expires_at", "device_challenges", ["expires_at"], unique=False)
    op.create_index("ix_device_challenges_consumed_at", "device_challenges", ["consumed_at"], unique=False)

    op.create_table(
        "device_access_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_device_access_tokens_id", "device_access_tokens", ["id"], unique=False)
    op.create_index("ix_device_access_tokens_device_id", "device_access_tokens", ["device_id"], unique=False)
    op.create_index("ix_device_access_tokens_token_hash", "device_access_tokens", ["token_hash"], unique=True)
    op.create_index("ix_device_access_tokens_expires_at", "device_access_tokens", ["expires_at"], unique=False)
    op.create_index("ix_device_access_tokens_revoked_at", "device_access_tokens", ["revoked_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_device_access_tokens_revoked_at", table_name="device_access_tokens")
    op.drop_index("ix_device_access_tokens_expires_at", table_name="device_access_tokens")
    op.drop_index("ix_device_access_tokens_token_hash", table_name="device_access_tokens")
    op.drop_index("ix_device_access_tokens_device_id", table_name="device_access_tokens")
    op.drop_index("ix_device_access_tokens_id", table_name="device_access_tokens")
    op.drop_table("device_access_tokens")

    op.drop_index("ix_device_challenges_consumed_at", table_name="device_challenges")
    op.drop_index("ix_device_challenges_expires_at", table_name="device_challenges")
    op.drop_index("ix_device_challenges_device_id", table_name="device_challenges")
    op.drop_index("ix_device_challenges_challenge_id", table_name="device_challenges")
    op.drop_index("ix_device_challenges_id", table_name="device_challenges")
    op.drop_table("device_challenges")

    op.drop_index("ix_device_registrations_status", table_name="device_registrations")
    op.drop_index("ix_device_registrations_device_id", table_name="device_registrations")
    op.drop_index("ix_device_registrations_id", table_name="device_registrations")
    op.drop_table("device_registrations")
