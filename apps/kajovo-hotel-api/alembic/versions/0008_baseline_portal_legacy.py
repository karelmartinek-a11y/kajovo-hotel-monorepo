"""baseline placeholder for legacy schema

Revision ID: 0008
Revises: None
Create Date: 2026-02-23 23:10:00.000000
"""

from alembic import op

revision = "0008"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Legacy produkční databáze už tabulky má; tento krok pouze nastaví baseline.
    pass


def downgrade() -> None:
    # Nenarušujeme stávající schéma.
    pass
