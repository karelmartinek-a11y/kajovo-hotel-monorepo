"""Persist the scoped OAuth authority for the hotel MCP resource."""

import sqlalchemy as sa

from alembic import op

revision = "0055_hotel_mcp_oauth"
down_revision = "0054_merge_reports_into_issues"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "hotel_oauth_client",
        sa.Column("id", sa.String(160), primary_key=True),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_hotel_oauth_client_created_at", "hotel_oauth_client", ["created_at"])
    op.create_table(
        "hotel_oauth_grant",
        sa.Column("digest", sa.String(64), primary_key=True),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("family", sa.String(64), nullable=False),
        sa.Column(
            "client_id",
            sa.String(160),
            sa.ForeignKey("hotel_oauth_client.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_hotel_oauth_grant_family", "hotel_oauth_grant", ["family"])
    op.create_index("ix_hotel_oauth_grant_client_id", "hotel_oauth_grant", ["client_id"])
    op.create_index("ix_hotel_oauth_grant_expiration", "hotel_oauth_grant", ["expires_at"])


def downgrade():
    raise RuntimeError("Hotel MCP OAuth grants must survive a code rollback")
