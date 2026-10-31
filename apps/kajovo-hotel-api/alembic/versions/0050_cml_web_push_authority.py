"""Retain legacy web subscriptions without granting them CML notification access."""
import sqlalchemy as sa
from alembic import op

revision = "0050_cml_web_push_authority"
down_revision = "0049_cml_profile_provision"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("chat_push_subscriptions", sa.Column(
        "cml_authorized", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    raise RuntimeError("CML web push authority must survive rollback; legacy senders are not a safe fallback")
