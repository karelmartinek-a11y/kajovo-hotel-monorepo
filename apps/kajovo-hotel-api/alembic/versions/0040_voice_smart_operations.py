"""Minimal durable identity for uncertain voice controls."""
import sqlalchemy as sa
from alembic import op

revision = "0040_voice_smart_operations"
down_revision = "0039_voice_core_settings"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("voice_smart_operations",
                    sa.Column("request_id", sa.String(80), primary_key=True),
                    sa.Column("owner_session_id", sa.String(128), nullable=False),
                    sa.Column("call_id", sa.String(128), nullable=False),
                    sa.Column("arguments_digest", sa.String(64), nullable=False),
                    sa.Column("status", sa.String(16), nullable=False),
                    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
                    sa.UniqueConstraint("owner_session_id", "call_id", name="uq_voice_smart_provider_call"))
    op.create_index("ix_voice_smart_operations_owner_session_id", "voice_smart_operations", ["owner_session_id"])


def downgrade():
    op.drop_table("voice_smart_operations")
