"""add devices

Revision ID: 0020_add_devices
Revises: 0019_add_report_photos
Create Date: 2026-03-11 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0020_add_devices"
down_revision: str | None = "0019_add_report_photos"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("roles_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("public_key", sa.LargeBinary(), nullable=True),
        sa.Column("public_key_alg", sa.String(length=32), nullable=True),
        sa.Column("token_hash", sa.String(length=255), nullable=True),
        sa.Column("device_info_json", sa.Text(), nullable=True),
        sa.Column("registered_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_challenge_nonce", sa.String(length=128), nullable=True),
        sa.Column("last_challenge_issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_devices_id"), "devices", ["id"], unique=False)
    op.create_index(op.f("ix_devices_device_id"), "devices", ["device_id"], unique=True)
    op.create_index(op.f("ix_devices_status"), "devices", ["status"], unique=False)
    op.create_index(op.f("ix_devices_token_hash"), "devices", ["token_hash"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_devices_token_hash"), table_name="devices")
    op.drop_index(op.f("ix_devices_status"), table_name="devices")
    op.drop_index(op.f("ix_devices_device_id"), table_name="devices")
    op.drop_index(op.f("ix_devices_id"), table_name="devices")
    op.drop_table("devices")
