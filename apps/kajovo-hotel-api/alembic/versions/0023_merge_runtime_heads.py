"""merge runtime heads

Revision ID: 0023_merge_runtime_heads
Revises: 0019_add_report_media_and_admin_profile, 0022_add_inventory_cards, 0022_add_smtp_delivery_flags
Create Date: 2026-03-15 16:10:00.000000
"""

from collections.abc import Sequence


revision: str = "0023_merge_runtime_heads"
down_revision: Sequence[str] | None = (
    "0019_add_report_media_and_admin_profile",
    "0022_add_inventory_cards",
    "0022_add_smtp_delivery_flags",
)
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
