"""Daily breakfast notification settings and durable delivery receipts."""
import sqlalchemy as sa
from alembic import op

revision = "0052_breakfast_whatsapp"
down_revision = "0051_lost_found_whatsapp"
branch_labels = None
depends_on = None


def upgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    if "breakfast_whatsapp_settings" not in existing:
        op.create_table("breakfast_whatsapp_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("send_time", sa.String(5), nullable=False),
            sa.Column("recipients", sa.JSON(), nullable=False),
            sa.Column("revision", sa.Integer(), nullable=False),
            sa.Column("next_run_at", sa.DateTime(timezone=True)),
            sa.CheckConstraint("id = 1", name="breakfast_whatsapp_singleton"))
    if "breakfast_whatsapp_runs" not in existing:
        op.create_table("breakfast_whatsapp_runs",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("scheduled_date", sa.Date(), nullable=False, unique=True),
            sa.Column("service_date", sa.Date(), nullable=False),
            sa.Column("settings_revision", sa.Integer(), nullable=False),
            sa.Column("recipients", sa.JSON(), nullable=False),
            sa.Column("state", sa.String(24), nullable=False),
            sa.Column("breakfast_count", sa.Integer()),
            sa.Column("source_checked_at", sa.DateTime(timezone=True)),
            sa.Column("error_code", sa.String(80)),
            sa.Column("retry_at", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    if "breakfast_whatsapp_deliveries" not in existing:
        op.create_table("breakfast_whatsapp_deliveries",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("run_id", sa.String(36), sa.ForeignKey("breakfast_whatsapp_runs.id"), nullable=False),
            sa.Column("recipient", sa.String(16), nullable=False),
            sa.Column("state", sa.String(24), nullable=False),
            sa.Column("provider_message_id", sa.String(255)),
            sa.Column("error_code", sa.String(80)),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("run_id", "recipient", name="breakfast_whatsapp_recipient"))
        op.create_index("ix_breakfast_whatsapp_deliveries_run_id", "breakfast_whatsapp_deliveries", ["run_id"])


def downgrade():
    raise RuntimeError("Preserve notification identities and receipts on code rollback")
