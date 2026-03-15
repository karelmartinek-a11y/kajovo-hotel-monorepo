"""add inventory cards and card items

Revision ID: 0022_add_inventory_cards
Revises: 0021_add_smtp_test_tracking
Create Date: 2026-03-11 16:20:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0022_add_inventory_cards"
down_revision: str | None = "0021_add_smtp_test_tracking"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "inventory_cards",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("card_type", sa.String(length=16), nullable=False),
        sa.Column("number", sa.String(length=32), nullable=False),
        sa.Column("card_date", sa.Date(), nullable=False),
        sa.Column("supplier", sa.String(length=255), nullable=True),
        sa.Column("reference", sa.String(length=64), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inventory_cards_id"), "inventory_cards", ["id"], unique=False)
    op.create_index(op.f("ix_inventory_cards_card_type"), "inventory_cards", ["card_type"], unique=False)
    op.create_index(op.f("ix_inventory_cards_number"), "inventory_cards", ["number"], unique=True)
    op.create_index(op.f("ix_inventory_cards_card_date"), "inventory_cards", ["card_date"], unique=False)

    op.create_table(
        "inventory_card_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("card_id", sa.Integer(), nullable=False),
        sa.Column("ingredient_id", sa.Integer(), nullable=False),
        sa.Column("quantity_base", sa.Integer(), nullable=False),
        sa.Column("quantity_pieces", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["card_id"], ["inventory_cards.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ingredient_id"], ["inventory_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_inventory_card_items_id"), "inventory_card_items", ["id"], unique=False)
    op.create_index(op.f("ix_inventory_card_items_card_id"), "inventory_card_items", ["card_id"], unique=False)
    op.create_index(op.f("ix_inventory_card_items_ingredient_id"), "inventory_card_items", ["ingredient_id"], unique=False)

    with op.batch_alter_table("inventory_movements") as batch_op:
        batch_op.add_column(sa.Column("card_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("card_item_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("quantity_pieces", sa.Integer(), nullable=False, server_default="0"))
        batch_op.create_index(op.f("ix_inventory_movements_card_id"), ["card_id"], unique=False)
        batch_op.create_index(op.f("ix_inventory_movements_card_item_id"), ["card_item_id"], unique=False)
        batch_op.create_foreign_key(
            "fk_inventory_movements_card_id_inventory_cards",
            "inventory_cards",
            ["card_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_inventory_movements_card_item_id_inventory_card_items",
            "inventory_card_items",
            ["card_item_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("inventory_movements") as batch_op:
        batch_op.drop_constraint("fk_inventory_movements_card_item_id_inventory_card_items", type_="foreignkey")
        batch_op.drop_constraint("fk_inventory_movements_card_id_inventory_cards", type_="foreignkey")
        batch_op.drop_index(op.f("ix_inventory_movements_card_item_id"))
        batch_op.drop_index(op.f("ix_inventory_movements_card_id"))
        batch_op.drop_column("quantity_pieces")
        batch_op.drop_column("card_item_id")
        batch_op.drop_column("card_id")

    op.drop_index(op.f("ix_inventory_card_items_ingredient_id"), table_name="inventory_card_items")
    op.drop_index(op.f("ix_inventory_card_items_card_id"), table_name="inventory_card_items")
    op.drop_index(op.f("ix_inventory_card_items_id"), table_name="inventory_card_items")
    op.drop_table("inventory_card_items")

    op.drop_index(op.f("ix_inventory_cards_card_date"), table_name="inventory_cards")
    op.drop_index(op.f("ix_inventory_cards_number"), table_name="inventory_cards")
    op.drop_index(op.f("ix_inventory_cards_card_type"), table_name="inventory_cards")
    op.drop_index(op.f("ix_inventory_cards_id"), table_name="inventory_cards")
    op.drop_table("inventory_cards")
