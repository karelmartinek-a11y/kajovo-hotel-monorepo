"""add smtp from email

Revision ID: 0025_add_smtp_from_email
Revises: 0024_add_auth_token_purpose
Create Date: 2026-03-17 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0025_add_smtp_from_email"
down_revision: str | Sequence[str] | None = "0024_add_auth_token_purpose"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "portal_smtp_settings",
        sa.Column("from_email", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("portal_smtp_settings", "from_email")
