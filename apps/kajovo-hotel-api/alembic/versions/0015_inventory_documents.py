"""add inventory document metadata

Revision ID: 0015_inventory_documents
Revises: 0014_add_last_login_at_to_portal_users
Create Date: 2026-03-05 23:45:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0015_inventory_documents"
down_revision: str | None = "0014_add_last_login_at_to_portal_users"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("inventory_movements", sa.Column("document_number", sa.String(length=32), nullable=True))
    op.add_column("inventory_movements", sa.Column("document_reference", sa.String(length=64), nullable=True))
    op.add_column("inventory_movements", sa.Column("document_date", sa.Date(), nullable=True))
    op.create_index(op.f("ix_inventory_movements_document_number"), "inventory_movements", ["document_number"], unique=False)
    op.create_index(op.f("ix_inventory_movements_document_date"), "inventory_movements", ["document_date"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_inventory_movements_document_date"), table_name="inventory_movements")
    op.drop_index(op.f("ix_inventory_movements_document_number"), table_name="inventory_movements")
    op.drop_column("inventory_movements", "document_date")
    op.drop_column("inventory_movements", "document_reference")
    op.drop_column("inventory_movements", "document_number")
