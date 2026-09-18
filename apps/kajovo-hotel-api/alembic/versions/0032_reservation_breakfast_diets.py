"""Persist breakfast diets for the entire reservation and seed existing flags."""

import logging

import sqlalchemy as sa

from alembic import op

revision = "0032_reservation_breakfast_diets"
down_revision = "0031_reservation_amenities"
branch_labels = None
depends_on = None

KEYS = ("diet_no_gluten", "diet_no_milk", "diet_no_pork")


def upgrade() -> None:
    diets = op.create_table(
        "reservation_breakfast_diets",
        sa.Column("reservation_id", sa.String(128), primary_key=True),
        sa.Column("guest_name", sa.String(255), nullable=True),
        sa.Column("arrival", sa.Date(), nullable=True),
        sa.Column("departure", sa.Date(), nullable=True),
        *(sa.Column(key, sa.Boolean(), nullable=False) for key in KEYS),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("updated_by", sa.String(255), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    orders = sa.table("breakfast_orders", sa.column("id", sa.Integer), sa.column("source_key", sa.String),
                      sa.column("service_date", sa.Date), *(sa.column(key, sa.Boolean) for key in KEYS))
    connection = op.get_bind()
    flags: dict[str, dict[str, bool]] = {}
    linked: list[tuple[int, list[str]]] = []
    unlinked = 0
    for row in connection.execute(sa.select(orders)).mappings():
        parts = (row["source_key"] or "").split("|")
        if len(parts) < 2 or parts[0] != row["service_date"].isoformat() or any(
            not value.strip() or value == "unknown" or len(value) > 128 for value in parts[1:]
        ):
            unlinked += 1
            continue
        ids = sorted(set(parts[1:]))
        linked.append((row["id"], ids))
        for reservation_id in ids:
            target = flags.setdefault(reservation_id, dict.fromkeys(KEYS, False))
            for key in KEYS:
                target[key] |= bool(row[key])
    if flags:
        connection.execute(diets.insert(), [dict(reservation_id=value, version=1, updated_by="migration", **state)
                                           for value, state in flags.items()])
    for order_id, ids in linked:
        connection.execute(orders.update().where(orders.c.id == order_id).values(
            **{key: any(flags[value][key] for value in ids) for key in KEYS}
        ))
    logging.getLogger("alembic.runtime.migration").warning(
        "Breakfast diet migration: reservations=%d, linked_orders=%d, preserved_unlinked_orders=%d",
        len(flags), len(linked), unlinked,
    )


def downgrade() -> None:
    op.drop_table("reservation_breakfast_diets")
