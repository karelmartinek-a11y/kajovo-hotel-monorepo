"""Persist global Voice Core configuration and authenticated ciphertext."""

import sqlalchemy as sa
from alembic import op

revision = "0039_voice_core_settings"
down_revision = "0038_chat_fcm_delivery_tracking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("voice_core_settings", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("config_json", sa.JSON(), nullable=False),
                    sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
                    sa.Column("encrypted_api_key", sa.Text(), nullable=True),
                    sa.CheckConstraint("id = 1", name="voice_core_singleton"))


def downgrade() -> None:
    op.drop_table("voice_core_settings")
