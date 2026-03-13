import mimetypes
from datetime import date
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import (
    InventoryAuditLogRead,
    InventoryBootstrapStatusRead,
    InventoryCardCreate,
    InventoryCardDetailRead,
    InventoryCardItemRead,
    InventoryCardRead,
    InventoryCardType,
    InventoryItemCreate,
    InventoryItemDetailRead,
    InventoryItemRead,
    InventoryItemUpdate,
    InventoryItemWithAuditRead,
    InventoryMovementCreate,
    InventoryMovementRead,
    InventoryMovementType,
)
from app.config import get_settings
from app.db.models import (
    InventoryAuditLog,
    InventoryCard,
    InventoryCardItem,
    InventoryItem,
    InventoryMovement,
)
from app.db.session import get_db
from app.media.storage import InventoryMediaStorage
from app.security.rbac import module_access_dependency, require_actor_type
from app.services.pdf.inventory import build_inventory_stocktake_pdf

router = APIRouter(
    prefix="/api/v1/inventory",
    tags=["inventory"],
    dependencies=[Depends(module_access_dependency("inventory"))],
)


DEFAULT_INVENTORY_ITEMS: list[InventoryItemCreate] = [
    InventoryItemCreate(
        name="Mouka",
        unit="g",
        min_stock=5,
        current_stock=12,
        amount_per_piece_base=1000,
    ),
    InventoryItemCreate(
        name="Cukr",
        unit="g",
        min_stock=3,
        current_stock=8,
        amount_per_piece_base=1000,
    ),
    InventoryItemCreate(
        name="Káva",
        unit="g",
        min_stock=2,
        current_stock=4,
        amount_per_piece_base=1000,
    ),
    InventoryItemCreate(
        name="Čaj",
        unit="ks",
        min_stock=20,
        current_stock=80,
        amount_per_piece_base=1,
    ),
]


def _log_audit(db: Session, entity: str, resource_id: int, action: str, detail: str) -> None:
    db.add(
        InventoryAuditLog(
            entity=entity,
            resource_id=resource_id,
            action=action,
            detail=detail,
        )
    )


def _movement_prefix(movement_type: str) -> str:
    if movement_type == InventoryMovementType.IN.value:
        return "PR"
    if movement_type == InventoryMovementType.ADJUST.value:
        return "OD"
    return "VY"


def _next_document_number(db: Session, prefix: str, doc_date: date) -> str:
    year = doc_date.year
    like = f"{prefix}-{year}-%"
    last = db.execute(
        select(InventoryMovement.document_number)
        .where(InventoryMovement.document_number.like(like))
        .order_by(InventoryMovement.document_number.desc())
        .limit(1)
    ).scalar_one_or_none()
    seq = 0
    if last:
        parts = last.split("-")
        if len(parts) >= 3 and parts[-1].isdigit():
            seq = int(parts[-1])
    return f"{prefix}-{year}-{seq + 1:04d}"


def _load_item_or_404(db: Session, item_id: int) -> InventoryItem:
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return item


def _serialize_movement(movement: InventoryMovement) -> InventoryMovementRead:
    return InventoryMovementRead.model_validate(
        {
            "id": movement.id,
            "item_id": movement.item_id,
            "item_name": movement.item.name if movement.item else None,
            "unit": movement.item.unit if movement.item else None,
            "card_id": movement.card_id,
            "card_item_id": movement.card_item_id,
            "card_number": movement.card.number if movement.card else None,
            "movement_type": movement.movement_type,
            "document_number": movement.document_number,
            "document_reference": movement.document_reference,
            "document_date": movement.document_date,
            "quantity": movement.quantity,
            "quantity_pieces": movement.quantity_pieces,
            "note": movement.note,
            "created_at": movement.created_at,
        }
    )


def _serialize_card_item(card_item: InventoryCardItem) -> InventoryCardItemRead:
    return InventoryCardItemRead.model_validate(
        {
            "id": card_item.id,
            "card_id": card_item.card_id,
            "ingredient_id": card_item.ingredient_id,
            "ingredient_name": card_item.ingredient.name if card_item.ingredient else None,
            "unit": card_item.ingredient.unit if card_item.ingredient else None,
            "quantity_base": card_item.quantity_base,
            "quantity_pieces": card_item.quantity_pieces,
            "note": card_item.note,
            "created_at": card_item.created_at,
        }
    )


def _serialize_card(card: InventoryCard) -> InventoryCardDetailRead:
    return InventoryCardDetailRead.model_validate(
        {
            "id": card.id,
            "card_type": card.card_type,
            "number": card.number,
            "card_date": card.card_date,
            "supplier": card.supplier,
            "reference": card.reference,
            "note": card.note,
            "created_at": card.created_at,
            "updated_at": card.updated_at,
            "items": [_serialize_card_item(item).model_dump() for item in card.items],
        }
    )


def _load_card_or_404(db: Session, card_id: int) -> InventoryCard:
    card = db.scalar(
        select(InventoryCard)
        .where(InventoryCard.id == card_id)
        .options(selectinload(InventoryCard.items).selectinload(InventoryCardItem.ingredient))
        .options(selectinload(InventoryCard.movements).selectinload(InventoryMovement.item))
    )
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory card not found")
    return card


def _load_item_detail(db: Session, item_id: int) -> InventoryItem:
    item = db.scalar(
        select(InventoryItem)
        .where(InventoryItem.id == item_id)
        .options(
            selectinload(InventoryItem.movements).selectinload(InventoryMovement.card),
            selectinload(InventoryItem.movements).selectinload(InventoryMovement.item),
        )
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return item


@router.get("", response_model=list[InventoryItemRead])
@router.get("/ingredients", response_model=list[InventoryItemRead])
def list_items(
    low_stock: bool = Query(default=False), db: Session = Depends(get_db)
) -> list[InventoryItem]:
    query = select(InventoryItem).order_by(InventoryItem.name.asc(), InventoryItem.id.asc())
    if low_stock:
        query = query.where(InventoryItem.current_stock <= InventoryItem.min_stock)
    return list(db.scalars(query))


@router.get("/movements", response_model=list[InventoryMovementRead])
def list_movements(db: Session = Depends(get_db)) -> list[InventoryMovementRead]:
    movements = list(
        db.scalars(
            select(InventoryMovement)
            .options(selectinload(InventoryMovement.item), selectinload(InventoryMovement.card))
            .order_by(
                InventoryMovement.document_date.desc(),
                InventoryMovement.created_at.desc(),
                InventoryMovement.id.desc(),
            )
        )
    )
    return [_serialize_movement(movement) for movement in movements]


@router.get("/cards", response_model=list[InventoryCardRead])
def list_cards(db: Session = Depends(get_db)) -> list[InventoryCard]:
    return list(
        db.scalars(
            select(InventoryCard)
            .order_by(InventoryCard.card_date.desc(), InventoryCard.id.desc())
        )
    )


@router.post("/cards", response_model=InventoryCardDetailRead, status_code=status.HTTP_201_CREATED)
def create_card(payload: InventoryCardCreate, db: Session = Depends(get_db)) -> InventoryCardDetailRead:
    ingredient_ids = sorted({item.ingredient_id for item in payload.items})
    ingredients = {
        item.id: item
        for item in db.scalars(select(InventoryItem).where(InventoryItem.id.in_(ingredient_ids)))
    }
    missing_ids = [ingredient_id for ingredient_id in ingredient_ids if ingredient_id not in ingredients]
    if missing_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory ingredient not found: {missing_ids[0]}",
        )

    if payload.card_type in {InventoryCardType.OUT, InventoryCardType.ADJUST}:
        for line in payload.items:
            item = ingredients[line.ingredient_id]
            if line.quantity_base > item.current_stock:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock for ingredient '{item.name}'",
                )

    card = InventoryCard(
        card_type=payload.card_type.value,
        number=_next_document_number(db, _movement_prefix(payload.card_type.value), payload.card_date),
        card_date=payload.card_date,
        supplier=payload.supplier,
        reference=payload.reference,
        note=payload.note,
    )
    db.add(card)
    db.flush()

    for line in payload.items:
        ingredient = ingredients[line.ingredient_id]
        card_item = InventoryCardItem(
            card_id=card.id,
            ingredient_id=ingredient.id,
            quantity_base=line.quantity_base,
            quantity_pieces=line.quantity_pieces,
            note=line.note,
        )
        db.add(card_item)
        db.flush()

        if payload.card_type == InventoryCardType.IN:
            ingredient.current_stock += line.quantity_base
        else:
            ingredient.current_stock -= line.quantity_base
        db.add(ingredient)

        movement = InventoryMovement(
            item_id=ingredient.id,
            card_id=card.id,
            card_item_id=card_item.id,
            movement_type=payload.card_type.value,
            document_number=card.number,
            document_reference=payload.reference,
            document_date=payload.card_date,
            quantity=line.quantity_base,
            quantity_pieces=line.quantity_pieces,
            note=line.note or payload.note,
        )
        db.add(movement)
        _log_audit(
            db,
            "item",
            ingredient.id,
            "card",
            f"Card {card.number} ({payload.card_type.value}) changed stock by {line.quantity_base}.",
        )

    _log_audit(db, "card", card.id, "create", f"Created inventory card {card.number}.")
    db.commit()
    db.refresh(card)
    return _serialize_card(_load_card_or_404(db, card.id))


@router.get("/cards/{card_id}", response_model=InventoryCardDetailRead)
def get_card(card_id: int, db: Session = Depends(get_db)) -> InventoryCardDetailRead:
    return _serialize_card(_load_card_or_404(db, card_id))


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(
    card_id: int,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> None:
    card = _load_card_or_404(db, card_id)
    for movement in card.movements:
        item = movement.item or _load_item_or_404(db, movement.item_id)
        if movement.movement_type == InventoryMovementType.IN.value:
            if movement.quantity > item.current_stock:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock to revert card {card.number}",
                )
            item.current_stock -= movement.quantity
        else:
            item.current_stock += movement.quantity
        db.add(item)

    for movement in list(card.movements):
        db.delete(movement)
    for item in list(card.items):
        db.delete(item)

    _log_audit(db, "card", card.id, "delete", f"Deleted inventory card {card.number}.")
    db.delete(card)
    db.commit()


@router.get("/bootstrap-status", response_model=InventoryBootstrapStatusRead)
def get_inventory_bootstrap_status(
    _admin: None = Depends(require_actor_type("admin")),
) -> InventoryBootstrapStatusRead:
    settings = get_settings()
    return InventoryBootstrapStatusRead(
        enabled=settings.inventory_seed_enabled,
        environment=settings.environment,
    )


@router.post("/seed-defaults", response_model=list[InventoryItemRead], status_code=status.HTTP_201_CREATED)
def seed_default_items(
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> list[InventoryItem]:
    existing_names = {name for (name,) in db.execute(select(InventoryItem.name)).all()}
    created: list[InventoryItem] = []
    for payload in DEFAULT_INVENTORY_ITEMS:
        if payload.name in existing_names:
            continue
        item = InventoryItem(**payload.model_dump())
        db.add(item)
        db.flush()
        _log_audit(db, "item", item.id, "seed", f"Seeded default inventory item '{item.name}'.")
        created.append(item)
    db.commit()
    for item in created:
        db.refresh(item)
    return created


@router.post("", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: InventoryItemCreate,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> InventoryItem:
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    db.flush()
    _log_audit(db, "item", item.id, "create", f"Created inventory item '{item.name}'.")
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=InventoryItemWithAuditRead)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> InventoryItemWithAuditRead:
    item = db.scalar(
        select(InventoryItem)
        .where(InventoryItem.id == item_id)
        .options(selectinload(InventoryItem.movements))
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )

    audit_logs = list(
        db.scalars(
            select(InventoryAuditLog)
            .where(InventoryAuditLog.entity == "item", InventoryAuditLog.resource_id == item.id)
            .order_by(InventoryAuditLog.created_at.desc(), InventoryAuditLog.id.desc())
        )
    )
    item_payload = InventoryItemDetailRead.model_validate(item).model_dump(exclude={"movements"})

    return InventoryItemWithAuditRead(
        **item_payload,
        movements=[_serialize_movement(movement) for movement in item.movements],
        audit_logs=[InventoryAuditLogRead.model_validate(log) for log in audit_logs],
    )


@router.put("/{item_id}", response_model=InventoryItemRead)
def update_item(
    item_id: int,
    payload: InventoryItemUpdate,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> InventoryItem:
    item = _load_item_or_404(db, item_id)

    updates = payload.model_dump(exclude_unset=True)
    updates.pop("current_stock", None)
    for key, value in updates.items():
        setattr(item, key, value)

    if updates:
        _log_audit(db, "item", item.id, "update", "Updated inventory item fields.")

    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{item_id}/movements", response_model=InventoryItemDetailRead)
def add_movement(
    item_id: int, payload: InventoryMovementCreate, db: Session = Depends(get_db)
) -> InventoryItem:
    item = _load_item_or_404(db, item_id)

    doc_date = payload.document_date
    if payload.movement_type == InventoryMovementType.IN:
        if not payload.document_reference:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Document reference is required for IN movement",
            )
        item.current_stock += payload.quantity
    else:
        if payload.quantity > item.current_stock:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient stock for OUT movement",
            )
        item.current_stock -= payload.quantity

    movement = InventoryMovement(
        item_id=item.id,
        movement_type=payload.movement_type.value,
        document_number=_next_document_number(db, _movement_prefix(payload.movement_type.value), doc_date),
        document_reference=payload.document_reference,
        document_date=doc_date,
        quantity=payload.quantity,
        quantity_pieces=payload.quantity_pieces,
        note=payload.note,
    )

    db.add(movement)
    db.add(item)
    _log_audit(
        db,
        "item",
        item.id,
        "movement",
        f"Recorded movement {payload.movement_type.value} ({payload.quantity}).",
    )
    db.commit()
    return _load_item_detail(db, item_id)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> None:
    item = _load_item_detail(db, item_id)
    has_history = db.scalar(
        select(InventoryAuditLog.id)
        .where(InventoryAuditLog.entity == "item", InventoryAuditLog.resource_id == item.id)
        .where(InventoryAuditLog.action.in_(["movement", "movement_delete", "card"]))
        .limit(1)
    )
    if item.movements or item.card_lines or has_history:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inventory item with history cannot be deleted",
        )

    _log_audit(db, "item", item.id, "delete", f"Deleted inventory item '{item.name}'.")
    db.delete(item)
    db.commit()


@router.delete("/{item_id}/movements/{movement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_movement(
    item_id: int,
    movement_id: int,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> None:
    item = _load_item_or_404(db, item_id)
    movement = db.scalar(
        select(InventoryMovement)
        .where(InventoryMovement.id == movement_id)
        .options(selectinload(InventoryMovement.card))
    )
    if not movement or movement.item_id != item.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory movement not found")
    if movement.card_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Delete the inventory card instead of an attached movement",
        )
    if movement.movement_type == InventoryMovementType.IN.value:
        if movement.quantity > item.current_stock:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient stock to revert IN movement",
            )
        item.current_stock -= movement.quantity
    else:
        item.current_stock += movement.quantity
    db.add(item)
    _log_audit(
        db,
        "item",
        item.id,
        "movement_delete",
        f"Deleted movement {movement.id} ({movement.movement_type}).",
    )
    db.delete(movement)
    db.commit()


@router.post("/{item_id}/pictogram", response_model=InventoryItemRead)
def upload_item_pictogram(
    item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> InventoryItem:
    item = _load_item_or_404(db, item_id)

    storage = InventoryMediaStorage(get_settings().media_root)
    stored = storage.store_pictogram(
        ingredient_id=item.id,
        src_file=file.file,
        src_filename=file.filename or "pictogram.jpg",
    )
    item.pictogram_path = stored.original_relpath
    item.pictogram_thumb_path = stored.thumb_relpath
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}/pictogram/{kind}")
def get_item_pictogram(item_id: int, kind: str, db: Session = Depends(get_db)):
    item = _load_item_or_404(db, item_id)
    if kind not in {"thumb", "original"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported kind")
    rel = item.pictogram_thumb_path if kind == "thumb" else item.pictogram_path
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pictogram not found")
    storage = InventoryMediaStorage(get_settings().media_root)
    path = storage.resolve(rel)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found")
    media_type = "image/jpeg" if kind == "thumb" else (mimetypes.guess_type(path.name)[0] or "image/jpeg")
    return FileResponse(path, media_type=media_type)


@router.get("/stocktake/pdf")
def export_stocktake_pdf(
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
):
    items = list(
        db.scalars(select(InventoryItem).order_by(InventoryItem.name.asc(), InventoryItem.id.asc()))
    )
    pdf_bytes = build_inventory_stocktake_pdf(items, stock_date=date.today())
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=inventory-stocktake.pdf"},
    )
