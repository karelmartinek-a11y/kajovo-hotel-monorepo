"""Store daily breakfast reservation display details."""

from alembic import op
import sqlalchemy as sa


revision = "0035_breakfast_reservation_details"
down_revision = "0034_breakfast_guest_display"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("breakfast_orders", sa.Column("reservation_details_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("breakfast_orders", "reservation_details_json")
