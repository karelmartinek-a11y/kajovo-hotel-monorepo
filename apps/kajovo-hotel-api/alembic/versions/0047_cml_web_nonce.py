"""Persist single-use CML assertions across workers and restarts."""
from alembic import op
import sqlalchemy as sa
revision = '0047_cml_web_nonce'
down_revision = '0046_current_voice_schema'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('cml_web_nonce',sa.Column('jti',sa.String(36),primary_key=True),sa.Column('expires_at',sa.BigInteger(),nullable=False))
    op.create_index('ix_cml_web_nonce_expiry','cml_web_nonce',['expires_at'])

def downgrade():
    raise RuntimeError('CML assertion replay protection cannot be removed by downgrade')
