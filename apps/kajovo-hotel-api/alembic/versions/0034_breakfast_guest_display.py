"""Store all room guests and nationality for the breakfast overview."""

from alembic import op
import sqlalchemy as sa

revision = "0034_breakfast_guest_display"
down_revision = "0033_portal_locale_web_activity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("breakfast_orders", sa.Column("guest_names", sa.Text(), nullable=True))
    op.add_column("breakfast_orders", sa.Column("country_code", sa.String(length=2), nullable=True))


def downgrade() -> None:
    op.drop_column("breakfast_orders", "country_code")
    op.drop_column("breakfast_orders", "guest_names")
