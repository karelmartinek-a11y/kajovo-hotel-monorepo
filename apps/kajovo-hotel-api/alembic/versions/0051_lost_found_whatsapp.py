"""Keep new-find notifications durable without broadcasting historical records."""

import sqlalchemy as sa
from alembic import op

revision = "0051_lost_found_whatsapp"
down_revision = "0050_cml_web_push_authority"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("lost_found_items", sa.Column("whatsapp_event_id", sa.String(36), nullable=True))
    op.create_index(
        "ix_lost_found_items_whatsapp_event_id",
        "lost_found_items",
        ["whatsapp_event_id"],
        unique=True,
    )
    op.create_table(
        "lost_found_whatsapp_parts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.String(36), nullable=False),
        sa.Column("part_key", sa.String(64), nullable=False),
        sa.Column("recipient", sa.String(32), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("media_path", sa.Text(), nullable=True),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("event_id", "part_key", name="uq_lost_found_whatsapp_part"),
    )
    op.create_index(
        "ix_lost_found_whatsapp_parts_item_id", "lost_found_whatsapp_parts", ["item_id"]
    )
    op.create_index(
        "ix_lost_found_whatsapp_parts_event_id", "lost_found_whatsapp_parts", ["event_id"]
    )
    op.create_index("ix_lost_found_whatsapp_parts_state", "lost_found_whatsapp_parts", ["state"])


def downgrade():
    raise RuntimeError("Notification identities and uncertain outcomes must survive rollback")
