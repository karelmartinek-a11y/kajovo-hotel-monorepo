"""Inventory paginates the native warehouse's own tables."""

from contextlib import contextmanager
from datetime import date, datetime
from typing import Generic, Literal, TypeVar
from urllib.parse import urlencode

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.routes import egg_orders, inventory
from app.api.schemas import (
    InventoryCardItemRead,
    InventoryCardRead,
    InventoryItemCreate,
    InventoryItemUpdate,
    InventoryMovementRead,
)
from app.db.models import (
    InventoryAuditLog,
    InventoryCard,
    InventoryCardType,
    InventoryItem,
    InventoryMovement,
    InventoryMovementType,
)
from app.db.warehouse import Warehouse, get_warehouse_db
from app.security.rbac import require_role
from app.services.hotel_mcp_file import ChatFile, download_photo
from app.services.hotel_mcp_reads import SECTION, FileLink

warehouse_session = contextmanager(get_warehouse_db)
Row = TypeVar("Row")


class Page(BaseModel, Generic[Row]):
    items: list[Row]
    next_id: int | None = None


class ItemSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    unit: str
    current_stock: int
    min_stock: int
    amount_per_piece_base: int


class ItemDetail(ItemSummary):
    created_at: datetime
    updated_at: datetime
    has_pictogram: bool


class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    unit: Literal["g", "l", "ks"]
    min_stock: int = Field(ge=0)
    current_stock: int = Field(ge=0)
    amount_per_piece_base: int = Field(default=1, ge=1)

    def native(self) -> InventoryItemCreate:
        return InventoryItemCreate(**self.model_dump())


class ItemPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit: Literal["g", "l", "ks"] | None = None
    min_stock: int | None = Field(default=None, ge=0)
    amount_per_piece_base: int | None = Field(default=None, ge=1)

    def native(self) -> InventoryItemUpdate:
        changes = self.model_dump(exclude_none=True)
        if not changes:
            raise HTTPException(400, "Vyber alespoň jedno pole ke změně.")
        return InventoryItemUpdate(**changes)


class MovementSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    movement_type: InventoryMovementType
    document_number: str | None
    document_date: date | None
    quantity: int
    quantity_pieces: int


class AuditEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    detail: str
    created_at: datetime


class CardSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str
    card_type: InventoryCardType
    card_date: date


class CardDetail(InventoryCardRead):
    lines: Page[InventoryCardItemRead]


class EggLatest(BaseModel):
    order: egg_orders.OrderStatus | None


class EggSubmission(BaseModel):
    outcome: egg_orders.OrderStatus | egg_orders.RepeatOrder | egg_orders.BusyOrder


def _page(db, query, identifier, position, limit, cursor_id, *, ascending=False):
    if cursor_id is not None:
        cursor = query.where(identifier == cursor_id)
        if db.scalar(cursor.with_only_columns(identifier)) is None:
            raise HTTPException(409, "Položka kurzoru zmizela. Načti první stránku.")
        keys = tuple_(*position)
        target = cursor.with_only_columns(*position).correlate(None).scalar_subquery()
        query = query.where(keys > target if ascending else keys < target)
    ordering = [key.asc() if ascending else key.desc() for key in position]
    return list(db.scalars(query.order_by(*ordering).limit(limit + 1)))


def _project(rows, limit, model):
    return {
        "items": [model.model_validate(row) for row in rows[:limit]],
        "next_id": rows[limit - 1].id if len(rows) > limit else None,
    }


def list_items(
    db: Session, text: str | None, low_stock: bool, after_id: int | None, limit: int
) -> Page[ItemSummary]:
    query = select(InventoryItem)
    if text:
        query = query.where(InventoryItem.name.icontains(text, autoescape=True))
    if low_stock:
        query = query.where(InventoryItem.current_stock <= InventoryItem.min_stock)
    rows = _page(
        db,
        query,
        InventoryItem.id,
        (InventoryItem.name, InventoryItem.id),
        limit,
        after_id,
        ascending=True,
    )
    return Page[ItemSummary](**_project(rows, limit, ItemSummary))


def item_detail(db: Session, item_id: int) -> ItemDetail:
    item = db.get(InventoryItem, item_id)
    if item is None:
        raise HTTPException(404, "Skladová položka nebyla nalezena.")
    return ItemDetail(
        **ItemSummary.model_validate(item).model_dump(),
        created_at=item.created_at,
        updated_at=item.updated_at,
        has_pictogram=bool(item.pictogram_path),
    )


def list_movements(
    db: Session, item_id: int | None, before_id: int | None, limit: int
) -> Page[MovementSummary]:
    query = select(InventoryMovement)
    if item_id is not None:
        query = query.where(InventoryMovement.item_id == item_id)
    date_key = func.coalesce(InventoryMovement.document_date, date.min)
    rows = _page(
        db,
        query,
        InventoryMovement.id,
        (date_key, InventoryMovement.created_at, InventoryMovement.id),
        limit,
        before_id,
    )
    return Page[MovementSummary](**_project(rows, limit, MovementSummary))


def movement_detail(db: Session, movement_id: int) -> InventoryMovementRead:
    movement = db.get(InventoryMovement, movement_id)
    if movement is None:
        raise HTTPException(404, "Skladový pohyb nebyl nalezen.")
    return inventory.serialize_movement(movement)


def item_activity(db: Session, item_id: int, before_id: int | None, limit: int) -> Page[AuditEntry]:
    item_detail(db, item_id)
    query = select(InventoryAuditLog).where(
        InventoryAuditLog.entity == "item", InventoryAuditLog.resource_id == item_id
    )
    if before_id is not None:
        query = query.where(InventoryAuditLog.id < before_id)
    rows = list(db.scalars(query.order_by(InventoryAuditLog.id.desc()).limit(limit + 1)))
    return Page[AuditEntry](**_project(rows, limit, AuditEntry))


def list_cards(
    db: Session, card_type: InventoryCardType | None, before_id: int | None, limit: int
) -> Page[CardSummary]:
    query = select(InventoryCard)
    if card_type is not None:
        query = query.where(InventoryCard.card_type == card_type)
    rows = _page(
        db,
        query,
        InventoryCard.id,
        (InventoryCard.card_date, InventoryCard.id),
        limit,
        before_id,
    )
    return Page[CardSummary](**_project(rows, limit, CardSummary))


def card_detail(db: Session, card_id: int, after_id: int | None, limit: int) -> CardDetail:
    card = inventory.get_card(card_id, db)
    rows = [item for item in card.items if after_id is None or item.id > after_id]
    return CardDetail(
        **card.model_dump(exclude={"items"}),
        lines=Page[InventoryCardItemRead](**_project(rows, limit, InventoryCardItemRead)),
    )


def pictogram(
    db: Session, warehouse: Warehouse, item_id: int, kind: Literal["thumb", "original"]
) -> FileLink:
    response = inventory.get_item_pictogram(item_id, kind, download=False, db=db)
    query = urlencode({"warehouse": warehouse})
    return FileLink(
        href=f"{SECTION}/api/v1/inventory/{item_id}/pictogram/{kind}?{query}",
        media_type=response.media_type,
        kind="photo" if hasattr(response, "path") else "placeholder",
    )


def stocktake(warehouse: Warehouse) -> FileLink:
    query = urlencode({"warehouse": warehouse})
    return FileLink(
        href=f"{SECTION}/api/v1/inventory/stocktake/pdf?{query}",
        media_type="application/pdf",
        kind="live_pdf",
    )


def item_receipt(row: InventoryItem) -> dict:
    return {"record_id": row.id, "updated_at": row.updated_at.isoformat()}


def update_item(
    db: Session, item_id: int, changes: ItemPatch, expected_updated_at: datetime
) -> dict:
    row = db.get(InventoryItem, item_id, with_for_update=True)
    if row is None:
        raise HTTPException(404, "Skladová položka nebyla nalezena.")
    if row.updated_at != expected_updated_at:
        raise HTTPException(409, "Položka se změnila. Načti ji znovu.")
    return item_receipt(inventory.update_item(item_id, changes.native(), db))


def delete_item(db: Session, request: Request, item_id: int) -> dict:
    require_role("admin")(request)
    inventory.delete_item(item_id, db, None)
    return {"record_id": item_id}


def delete_movement(db: Session, request: Request, item_id: int, movement_id: int) -> dict:
    require_role("admin")(request)
    inventory.delete_movement(item_id, movement_id, db, None)
    return {"record_id": movement_id}


def delete_card(db: Session, request: Request, card_id: int) -> dict:
    require_role("admin")(request)
    inventory.delete_card(card_id, db, None)
    return {"record_id": card_id}


def upload_pictogram(db: Session, warehouse: Warehouse, item_id: int, file: ChatFile) -> dict:
    if db.get(InventoryItem, item_id, with_for_update=True) is None:
        raise HTTPException(404, "Skladová položka nebyla nalezena.")
    upload = download_photo(file)
    try:
        return item_receipt(inventory.upload_item_pictogram(item_id, upload, warehouse, db))
    finally:
        upload.file.close()
