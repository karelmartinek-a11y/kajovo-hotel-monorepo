from collections.abc import Iterator
from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import Depends
from sqlalchemy import URL, create_engine, make_url, text
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import (
    Base,
    InventoryAuditLog,
    InventoryCard,
    InventoryCardItem,
    InventoryItem,
    InventoryMovement,
)
from app.db.session import get_db


class Warehouse(StrEnum):
    BREAKFAST = "snidane"
    DRUGSTORE = "drogerie"


STOCK_TABLES = [
    model.__table__
    for model in (InventoryItem, InventoryCard, InventoryCardItem, InventoryMovement, InventoryAuditLog)
]


def warehouse_url(database_url: URL, warehouse: Warehouse) -> URL:
    name = database_url.database
    if database_url.get_backend_name() == "sqlite":
        if name in (None, "", ":memory:"):
            return database_url
        path = Path(name)
        return database_url.set(database=str(path.with_name(f"{path.stem}_sklad_{warehouse}{path.suffix}")))
    return database_url.set(database=f"{name}_sklad_{warehouse}")


def separate_warehouse_databases() -> bool:
    settings = get_settings()
    if settings.warehouse_separate_databases is not None:
        return settings.warehouse_separate_databases
    return settings.environment == "production" and make_url(settings.database_url).get_backend_name() == "postgresql"


@lru_cache(maxsize=2)
def warehouse_engine(database_url: URL, warehouse: Warehouse):
    url = warehouse_url(database_url, warehouse)
    options = {}
    if url.get_backend_name() == "sqlite" and url.database in (None, "", ":memory:"):
        options = {"poolclass": StaticPool, "connect_args": {"check_same_thread": False}}
    engine = create_engine(url, hide_parameters=True, pool_pre_ping=True, **options)
    try:
        with engine.begin() as connection:
            if connection.dialect.name == "postgresql":
                connection.execute(text("SELECT pg_advisory_xact_lock(1769080735)"))
            Base.metadata.create_all(connection, tables=STOCK_TABLES)
    except Exception:
        engine.dispose()
        raise
    return engine


def initialize_warehouses() -> None:
    database_url = make_url(get_settings().database_url)
    if separate_warehouse_databases():
        for warehouse in Warehouse:
            warehouse_engine(database_url, warehouse)
    elif database_url.get_backend_name() == "sqlite":
        warehouse_engine(database_url, Warehouse.DRUGSTORE)


def get_warehouse_db(
    db: Annotated[Session, Depends(get_db)], warehouse: Warehouse = Warehouse.BREAKFAST,
) -> Iterator[Session]:
    if not separate_warehouse_databases() and warehouse == Warehouse.BREAKFAST:
        yield db
        return
    engine = warehouse_engine(make_url(get_settings().database_url), warehouse)
    with Session(bind=engine, autoflush=False) as stock:
        yield stock
