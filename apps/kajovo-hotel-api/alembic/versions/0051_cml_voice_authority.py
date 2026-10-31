"""Purpose-bound CML voice background authority, separate from native cookies."""
from alembic import op
import sqlalchemy as sa

revision = "0051_cml_voice_authority"
down_revision = "0050_cml_web_push_authority"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "cml_voice_authority",
        sa.Column("sid", sa.String(36), primary_key=True),
        sa.Column("subject", sa.String(100), nullable=False),
        sa.Column("native_id", sa.String(20)),
        sa.Column("epoch", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("token_cipher", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("epoch > 0", name="cml_voice_authority_epoch"),
    )
    op.create_index("ix_cml_voice_authority_expiry", "cml_voice_authority", ["expires_at"])


def downgrade():
    raise RuntimeError("CML voice authority is additive; do not erase live authorization state")
