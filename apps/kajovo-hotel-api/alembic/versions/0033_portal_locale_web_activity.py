"""Store account language and web activity session policy."""

import sqlalchemy as sa
from alembic import op

revision = "0033_portal_locale_web_activity"
down_revision = "0032_reservation_breakfast_diets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("portal_users", sa.Column("preferred_locale", sa.String(2), nullable=False, server_default="cs"))
    op.add_column("auth_sessions", sa.Column("web_activity_session", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("auth_sessions", sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("auth_sessions", "last_activity_at")
    op.drop_column("auth_sessions", "web_activity_session")
    op.drop_column("portal_users", "preferred_locale")
