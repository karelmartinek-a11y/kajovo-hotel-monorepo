"""Private durable mail operation and audio receipt metadata."""
import sqlalchemy as sa
from alembic import op

revision = "0044_voice_mail_operations"
down_revision = "0043_voice_registry_plans"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("voice_mail_operations",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("owner_session_id", sa.String(128), nullable=False),
        sa.Column("voice_session_id", sa.String(32), nullable=False),
        sa.Column("call_id", sa.String(128), nullable=False),
        sa.Column("tool", sa.String(64), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("candidate_id", sa.String(128), unique=True),
        sa.Column("draft_ref", sa.String(128)), sa.Column("draft_version", sa.Integer()),
        sa.Column("body_hash", sa.String(64)), sa.Column("encrypted_token", sa.Text()),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("response_id", sa.String(128)), sa.Column("input_event_id", sa.String(256)),
        sa.Column("confirmation_id", sa.String(80)), sa.Column("send_request_id", sa.String(80)),
        sa.Column("receipt_id", sa.String(128)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_voice_mail_operations_owner_session_id", "voice_mail_operations", ["owner_session_id"])


def downgrade():
    op.drop_table("voice_mail_operations")
