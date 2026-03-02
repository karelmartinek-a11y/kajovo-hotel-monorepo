"""add_last_login_at_to_portal_users

Revision ID: 0014_add_last_login_at_to_portal_users
Revises: 0013_add_media_and_inventory_assets
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0014_add_last_login_at_to_portal_users"
down_revision = "0013_add_media_and_inventory_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("portal_users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("portal_users", "last_login_at")
