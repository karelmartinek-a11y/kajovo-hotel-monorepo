"""Keep the identity and Mail receipt of each warehouse egg order."""
import sqlalchemy as sa
from alembic import op

revision = "0053_inventory_egg_orders"
down_revision = "0052_breakfast_whatsapp"
branch_labels = None
depends_on = None


def upgrade():
    if "inventory_egg_orders" not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            "inventory_egg_orders",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("owner", sa.String(128), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("sent_at", sa.DateTime(timezone=True)),
            sa.Column("delivery_date", sa.Date(), nullable=False),
            sa.Column("recipient", sa.String(254), nullable=False),
            sa.Column("content_hash", sa.String(64), nullable=False),
            sa.Column("state", sa.String(16), nullable=False),
            sa.Column("mail_operation", sa.String(36)),
        )
        op.create_index("ix_inventory_egg_orders_owner", "inventory_egg_orders", ["owner"])


def downgrade():
    raise RuntimeError("Preserve warehouse order identities and receipts on code rollback")
