"""Keep native web request identity before an effect, without changing business rows."""

import sqlalchemy as sa

from alembic import op

revision = "0048_cml_web_request"
down_revision = "0047_cml_web_nonce"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cml_web_request",
        sa.Column("owner", sa.String(100), primary_key=True),
        sa.Column("request_id", sa.String(128), primary_key=True),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("permission", sa.String(64), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("response_status", sa.Integer()),
        sa.Column("response_json", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "state IN ('pending','completed','uncertain')", name="cml_web_request_state"
        ),
    )


def downgrade():
    raise RuntimeError("Native mutation identities must survive code rollback")
