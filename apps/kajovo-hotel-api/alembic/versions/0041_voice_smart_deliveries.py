"""Durable provider function output delivery receipts."""
import sqlalchemy as sa
from alembic import op

revision = "0041_voice_smart_deliveries"
down_revision = "0040_voice_smart_operations"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("voice_smart_deliveries",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("owner_session_id", sa.String(128), nullable=False),
        sa.Column("arguments_digest", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))


def downgrade():
    op.drop_table("voice_smart_deliveries")
