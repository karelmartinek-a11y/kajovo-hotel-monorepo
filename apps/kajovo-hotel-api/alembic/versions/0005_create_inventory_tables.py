"""create inventory tables

Revision ID: 0005_create_inventory_tables
Revises: 0004_create_issues_table
Create Date: 2026-02-18 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_create_inventory_tables"
down_revision: str | None = "0004_create_issues_table"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "inventory_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("min_stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("supplier", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inventory_items_id"), "inventory_items", ["id"], unique=False)
    op.create_index(op.f("ix_inventory_items_name"), "inventory_items", ["name"], unique=False)

    op.create_table(
        "inventory_movements",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("movement_type", sa.String(length=16), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["item_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inventory_movements_id"), "inventory_movements", ["id"], unique=False)
    op.create_index(
        op.f("ix_inventory_movements_item_id"),
        "inventory_movements",
        ["item_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inventory_movements_movement_type"),
        "inventory_movements",
        ["movement_type"],
        unique=False,
    )

    op.create_table(
        "inventory_audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entity", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_inventory_audit_logs_id"), "inventory_audit_logs", ["id"], unique=False
    )
    op.create_index(
        op.f("ix_inventory_audit_logs_entity"),
        "inventory_audit_logs",
        ["entity"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inventory_audit_logs_entity_id"),
        "inventory_audit_logs",
        ["entity_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_inventory_audit_logs_entity_id"), table_name="inventory_audit_logs")
    op.drop_index(op.f("ix_inventory_audit_logs_entity"), table_name="inventory_audit_logs")
    op.drop_index(op.f("ix_inventory_audit_logs_id"), table_name="inventory_audit_logs")
    op.drop_table("inventory_audit_logs")

    op.drop_index(op.f("ix_inventory_movements_movement_type"), table_name="inventory_movements")
    op.drop_index(op.f("ix_inventory_movements_item_id"), table_name="inventory_movements")
    op.drop_index(op.f("ix_inventory_movements_id"), table_name="inventory_movements")
    op.drop_table("inventory_movements")

    op.drop_index(op.f("ix_inventory_items_name"), table_name="inventory_items")
    op.drop_index(op.f("ix_inventory_items_id"), table_name="inventory_items")
    op.drop_table("inventory_items")
