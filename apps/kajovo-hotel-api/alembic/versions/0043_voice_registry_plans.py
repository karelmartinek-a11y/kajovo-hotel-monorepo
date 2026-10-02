"""Durable metadata for exact-plan audio confirmation and write recovery."""
import sqlalchemy as sa
from alembic import op

revision = "0043_voice_registry_plans"
down_revision = "0042_voice_memory"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("voice_registry_plans",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("owner_session_id", sa.String(128), nullable=False),
        sa.Column("voice_session_id", sa.String(32), nullable=False),
        sa.Column("plan_id", sa.String(256), nullable=False),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("requires_confirmation", sa.Boolean(), nullable=False),
        sa.Column("response_id", sa.String(128)),
        sa.Column("input_event_id", sa.String(256)),
        sa.Column("confirmation_id", sa.String(80)),
        sa.Column("request_id", sa.String(80), unique=True),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_voice_registry_plans_owner_session_id", "voice_registry_plans", ["owner_session_id"])


def downgrade():
    op.drop_table("voice_registry_plans")
