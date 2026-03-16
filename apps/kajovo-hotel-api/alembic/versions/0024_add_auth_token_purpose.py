"""add auth token purpose

Revision ID: 0024_add_auth_token_purpose
Revises: 0023_merge_runtime_heads
Create Date: 2026-03-16 00:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0024_add_auth_token_purpose"
down_revision: str | Sequence[str] | None = "0023_merge_runtime_heads"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "auth_unlock_tokens",
        sa.Column("purpose", sa.String(length=32), nullable=False, server_default="unlock"),
    )
    op.create_index(
        op.f("ix_auth_unlock_tokens_purpose"),
        "auth_unlock_tokens",
        ["purpose"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_unlock_tokens_purpose"), table_name="auth_unlock_tokens")
    op.drop_column("auth_unlock_tokens", "purpose")
