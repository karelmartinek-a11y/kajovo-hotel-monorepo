"""Track successful per-token FCM deliveries across retries."""

import sqlalchemy as sa

from alembic import op

revision = "0038_chat_fcm_delivery_tracking"
down_revision = "0037_chat_fcm"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat_fcm_outbox", sa.Column("delivered_token_ids", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_fcm_outbox", "delivered_token_ids")
