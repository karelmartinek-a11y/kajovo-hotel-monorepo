"""clear historic breakfast sync notes

Revision ID: 0029_clear_breakfast_system_notes
Revises: 0028_breakfast_display_overview
Create Date: 2026-07-22 01:02:00.000000
"""

from __future__ import annotations

from alembic import op

revision = "0029_clear_breakfast_system_notes"
down_revision = "0028_breakfast_display_overview"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE breakfast_orders
        SET note = NULL
        WHERE note LIKE 'Automatická synchronizace Better Hotel%'
           OR note LIKE 'Automaticka synchronizace Better Hotel%'
           OR note LIKE 'Ruční synchronizace Better Hotel%'
           OR note LIKE 'Rucni synchronizace Better Hotel%'
        """
    )


def downgrade() -> None:
    pass
