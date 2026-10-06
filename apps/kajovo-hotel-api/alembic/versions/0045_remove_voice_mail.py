"""Remove retired voice mail metadata without touching memory or technologies."""
import sqlalchemy as sa
from alembic import op

revision = "0045_remove_voice_mail"
down_revision = "0044_voice_mail_operations"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    for name in ("dagmar_voice_mail_operations", "voice_mail_operations"):
        sa.Table(name, sa.MetaData()).drop(connection, checkfirst=True)


def downgrade():
    from alembic.script import ScriptDirectory
    previous = ScriptDirectory.from_config(op.get_context().config).get_revision(down_revision)
    previous.module.upgrade()
