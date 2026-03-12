import mimetypes
from datetime import date
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import (
    InventoryAuditLogRead,
    InventoryItemCreate,
    InventoryItemDetailRead,
    InventoryItemRead,
    InventoryItemUpdate,
    InventoryItemWithAuditRead,
    InventoryMovementCreate,
    InventoryMovementType,
)
from app.config import get_settings
from app.db.models import InventoryAuditLog, InventoryItem, InventoryMovement
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


@router.get("", response_model=list[InventoryItemRead])
def list_items(
    low_stock: bool = Query(default=False), db: Session = Depends(get_db)
) -> list[InventoryItem]:
    query = select(InventoryItem).order_by(InventoryItem.name.asc(), InventoryItem.id.asc())
    if low_stock:
        query = query.where(InventoryItem.current_stock <= InventoryItem.min_stock)
    return list(db.scalars(query))


@router.post("/seed-defaults", response_model=list[InventoryItemRead], status_code=status.HTTP_201_CREATED)
def seed_default_items(db: Session = Depends(get_db)) -> list[InventoryItem]:
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
def create_item(payload: InventoryItemCreate, db: Session = Depends(get_db)) -> InventoryItem:
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    db.flush()
    _log_audit(db, "item", item.id, "create", f"Created inventory item '{item.name}'.")
    db.commit()
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=InventoryItemWithAuditRead)
def get_item(item_id: int, db: Session = Depends(get_db)) -> InventoryItemWithAuditRead:
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

    return InventoryItemWithAuditRead(
        **InventoryItemDetailRead.model_validate(item).model_dump(),
        audit_logs=[InventoryAuditLogRead.model_validate(log) for log in audit_logs],
    )


@router.put("/{item_id}", response_model=InventoryItemRead)
def update_item(
    item_id: int, payload: InventoryItemUpdate, db: Session = Depends(get_db)
) -> InventoryItem:
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )

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
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )

    doc_date = payload.document_date
    prefix = "PR"
    if payload.movement_type == InventoryMovementType.OUT:
        prefix = "VY"
    elif payload.movement_type == InventoryMovementType.ADJUST:
        prefix = "OD"

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
        document_number=_next_document_number(db, prefix, doc_date),
        document_reference=payload.document_reference,
        document_date=doc_date,
        quantity=payload.quantity,
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

    db.refresh(item)
    item = db.scalar(
        select(InventoryItem)
        .where(InventoryItem.id == item_id)
        .options(selectinload(InventoryItem.movements))
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )

    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, db: Session = Depends(get_db), _admin: None = Depends(require_actor_type("admin"))) -> None:
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
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
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    movement = db.get(InventoryMovement, movement_id)
    if not movement or movement.item_id != item.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory movement not found")
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
) -> InventoryItem:
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

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
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
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
def export_stocktake_pdf(db: Session = Depends(get_db)):
    items = list(
        db.scalars(select(InventoryItem).order_by(InventoryItem.name.asc(), InventoryItem.id.asc()))
    )
    pdf_bytes = build_inventory_stocktake_pdf(items, stock_date=date.today())
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=inventory-stocktake.pdf"},
    )
