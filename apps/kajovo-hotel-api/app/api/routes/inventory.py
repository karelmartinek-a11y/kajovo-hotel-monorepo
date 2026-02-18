from fastapi import APIRouter, Depends, HTTPException, Query, status
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
from app.db.models import InventoryAuditLog, InventoryItem, InventoryMovement
from app.db.session import get_db

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


def _log_audit(db: Session, entity: str, entity_id: int, action: str, detail: str) -> None:
    db.add(
        InventoryAuditLog(
            entity=entity,
            entity_id=entity_id,
            action=action,
            detail=detail,
        )
    )


@router.get("", response_model=list[InventoryItemRead])
def list_items(
    low_stock: bool = Query(default=False), db: Session = Depends(get_db)
) -> list[InventoryItem]:
    query = select(InventoryItem).order_by(InventoryItem.name.asc(), InventoryItem.id.asc())
    if low_stock:
        query = query.where(InventoryItem.current_stock <= InventoryItem.min_stock)
    return list(db.scalars(query))


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
            .where(InventoryAuditLog.entity == "item", InventoryAuditLog.entity_id == item.id)
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

    if payload.movement_type == InventoryMovementType.IN:
        item.current_stock += payload.quantity
    elif payload.movement_type == InventoryMovementType.OUT:
        if payload.quantity > item.current_stock:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Insufficient stock for OUT movement",
            )
        item.current_stock -= payload.quantity
    else:
        item.current_stock = payload.quantity

    movement = InventoryMovement(
        item_id=item.id,
        movement_type=payload.movement_type.value,
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
def delete_item(item_id: int, db: Session = Depends(get_db)) -> None:
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found"
        )

    _log_audit(db, "item", item.id, "delete", f"Deleted inventory item '{item.name}'.")
    db.delete(item)
    db.commit()
