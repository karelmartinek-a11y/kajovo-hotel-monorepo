"""Actual PostgreSQL transactions; explicit isolated local database only."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier
from uuid import uuid4

import pytest
from app.api.routes.inventory import add_movement, create_card, delete_card
from app.api.schemas import InventoryCardCreate, InventoryMovementCreate
from app.db.models import (
    Base,
    InventoryAuditLog,
    InventoryCard,
    InventoryCardItem,
    InventoryItem,
    InventoryMovement,
)
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker


@pytest.fixture
def postgres_inventory():
    raw = os.getenv("HOTEL_INVENTORY_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Explicit local PostgreSQL inventory test database required")
    url = make_url(raw)
    assert url.drivername.startswith("postgresql") and url.host in {"localhost", "127.0.0.1"}
    assert url.database and url.database.endswith("_test")
    schema = "inventory_" + uuid4().hex
    admin = create_engine(url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"}, pool_size=10)
    try:
        Base.metadata.create_all(engine, tables=[
            InventoryItem.__table__, InventoryCard.__table__, InventoryCardItem.__table__,
            InventoryMovement.__table__, InventoryAuditLog.__table__,
        ])
        yield sessionmaker(bind=engine)
    finally:
        engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def seed(factory, count=1, stock=10):
    with factory() as db:
        items = [InventoryItem(name=f"Synthetic stock {index}", unit="ks", min_stock=0,
                               current_stock=stock, amount_per_piece_base=1)
                 for index in range(count)]
        db.add_all(items)
        db.commit()
        return [item.id for item in items]


def card(factory, ident, quantity, kind="out"):
    with factory() as db:
        result = create_card(InventoryCardCreate(
            card_type=kind, card_date=date(2026, 10, 31),
            items=[{"ingredient_id": ident, "quantity_base": quantity}],
        ), db=db)
        return result.id, result.number


def race(functions):
    barrier = Barrier(len(functions))

    def run(function):
        barrier.wait(timeout=10)
        try:
            return "created", function()
        except HTTPException as error:
            return error.status_code, None

    with ThreadPoolExecutor(max_workers=len(functions)) as executor:
        return list(executor.map(run, functions))


def test_postgres_competing_documents_preserve_stock(postgres_inventory):
    factory = postgres_inventory
    ident, = seed(factory)
    results = race([lambda: card(factory, ident, 6) for _ in range(4)])
    assert sorted(str(result[0]) for result in results) == ["400", "400", "400", "created"]
    with factory() as db:
        assert db.get(InventoryItem, ident).current_stock == 4
        assert db.scalar(select(func.count()).select_from(InventoryCard)) == 1
        assert db.scalar(select(func.count()).select_from(InventoryMovement)) == 1


def test_postgres_document_and_single_movement_share_stock_lock(postgres_inventory):
    factory = postgres_inventory
    ident, = seed(factory)

    def movement():
        with factory() as db:
            result = add_movement(ident, InventoryMovementCreate(
                movement_type="out", quantity=6, document_date=date(2026, 10, 31),
            ), db=db)
            return result.current_stock

    results = race([lambda: card(factory, ident, 6), movement])
    assert sorted(str(result[0]) for result in results) == ["400", "created"]
    with factory() as db:
        assert db.get(InventoryItem, ident).current_stock == 4
        assert db.scalar(select(func.count()).select_from(InventoryMovement)) == 1


def test_postgres_disjoint_documents_get_unique_original_numbers(postgres_inventory):
    factory = postgres_inventory
    ids = seed(factory, count=8, stock=0)
    results = race([lambda ident=ident: card(factory, ident, 1, "in") for ident in ids])
    assert all(result[0] == "created" for result in results)
    assert len({result[1][1] for result in results}) == 8
    assert {result[1][1] for result in results} == {f"PR-2026-{index:04d}" for index in range(1, 9)}
    with factory() as db:
        assert all(db.get(InventoryItem, ident).current_stock == 1 for ident in ids)


def test_postgres_two_deletions_compensate_own_document_once(postgres_inventory):
    factory = postgres_inventory
    ident, = seed(factory, stock=0)
    card_id, _ = card(factory, ident, 5, "in")

    def remove():
        with factory() as db:
            delete_card(card_id, db=db, _admin=None)

    results = race([remove, remove])
    assert sorted(str(result[0]) for result in results) == ["404", "created"]
    with factory() as db:
        assert db.get(InventoryItem, ident).current_stock == 0
        assert db.scalar(select(func.count()).select_from(InventoryMovement)) == 0
        assert db.scalar(select(func.count()).select_from(InventoryCard)) == 0
