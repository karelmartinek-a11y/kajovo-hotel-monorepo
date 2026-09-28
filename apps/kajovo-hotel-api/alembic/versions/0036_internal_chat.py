"""Add one-to-one internal chat and Web Push delivery queue."""

import sqlalchemy as sa

from alembic import op

revision = "0036_internal_chat"
down_revision = "0035_breakfast_reservation_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_participants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("principal_type", sa.String(length=24), nullable=False),
        sa.Column("principal_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("principal_type", "principal_id", name="uq_chat_participant_principal"),
    )
    op.create_table(
        "chat_conversations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("participant_low_id", sa.Integer(), sa.ForeignKey("chat_participants.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("participant_high_id", sa.Integer(), sa.ForeignKey("chat_participants.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("participant_low_id", "participant_high_id", name="uq_chat_conversation_participants"),
    )
    op.create_index("ix_chat_conversations_participant_low_id", "chat_conversations", ["participant_low_id"])
    op.create_index("ix_chat_conversations_participant_high_id", "chat_conversations", ["participant_high_id"])
    op.create_index("ix_chat_conversations_updated_at", "chat_conversations", ["updated_at"])
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_id", sa.Integer(), sa.ForeignKey("chat_participants.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("client_message_id", sa.String(length=64), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("sender_id", "client_message_id", name="uq_chat_message_client_id"),
    )
    op.create_index("ix_chat_messages_conversation_id", "chat_messages", ["conversation_id"])
    op.create_index("ix_chat_messages_sender_id", "chat_messages", ["sender_id"])
    op.create_index("ix_chat_messages_sent_at", "chat_messages", ["sent_at"])
    op.create_index("ix_chat_messages_read_at", "chat_messages", ["read_at"])
    op.create_table(
        "chat_push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("participant_id", sa.Integer(), sa.ForeignKey("chat_participants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_push_subscriptions_participant_id", "chat_push_subscriptions", ["participant_id"])
    op.create_table(
        "chat_push_outbox",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_push_outbox_next_attempt_at", "chat_push_outbox", ["next_attempt_at"])


def downgrade() -> None:
    op.drop_table("chat_push_outbox")
    op.drop_table("chat_push_subscriptions")
    op.drop_table("chat_messages")
    op.drop_table("chat_conversations")
    op.drop_table("chat_participants")
