"""Add native Android chat FCM registration and delivery outbox."""

import sqlalchemy as sa

from alembic import op

revision = "0037_chat_fcm"
down_revision = "0036_internal_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_fcm_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("participant_id", sa.Integer(), sa.ForeignKey("chat_participants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("token", name="uq_chat_fcm_tokens_token"),
    )
    op.create_index("ix_chat_fcm_tokens_participant_id", "chat_fcm_tokens", ["participant_id"])
    op.create_table(
        "chat_fcm_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("message_id", name="uq_chat_fcm_outbox_message"),
    )
    op.create_index("ix_chat_fcm_outbox_next_attempt_at", "chat_fcm_outbox", ["next_attempt_at"])


def downgrade() -> None:
    op.drop_table("chat_fcm_outbox")
    op.drop_table("chat_fcm_tokens")
