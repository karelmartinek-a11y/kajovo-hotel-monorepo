from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import (
    LostFoundItemCreate,
    LostFoundItemRead,
    LostFoundItemType,
    LostFoundItemUpdate,
    LostFoundStatus,
)
from app.db.models import LostFoundItem
from app.db.session import get_db

router = APIRouter(prefix="/api/v1/lost-found", tags=["lost-found"])


@router.get("", response_model=list[LostFoundItemRead])
def list_lost_found_items(
    item_type: LostFoundItemType | None = Query(default=None, alias="type"),
    status_filter: LostFoundStatus | None = Query(default=None, alias="status"),
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[LostFoundItem]:
    query = select(LostFoundItem).order_by(LostFoundItem.event_at.desc(), LostFoundItem.id.desc())

    if item_type:
        query = query.where(LostFoundItem.item_type == item_type.value)
    if status_filter:
        query = query.where(LostFoundItem.status == status_filter.value)
    if category:
        query = query.where(LostFoundItem.category == category)

    return list(db.scalars(query))


@router.get("/{item_id}", response_model=LostFoundItemRead)
def get_lost_found_item(item_id: int, db: Session = Depends(get_db)) -> LostFoundItem:
    item = db.get(LostFoundItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lost & found item not found",
        )
    return item


@router.post("", response_model=LostFoundItemRead, status_code=status.HTTP_201_CREATED)
def create_lost_found_item(
    payload: LostFoundItemCreate,
    db: Session = Depends(get_db),
) -> LostFoundItem:
    payload_data = payload.model_dump()
    payload_data["item_type"] = payload.item_type.value
    payload_data["status"] = payload.status.value
    item = LostFoundItem(**payload_data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=LostFoundItemRead)
def update_lost_found_item(
    item_id: int,
    payload: LostFoundItemUpdate,
    db: Session = Depends(get_db),
) -> LostFoundItem:
    item = db.get(LostFoundItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lost & found item not found",
        )

    updates = payload.model_dump(exclude_unset=True)
    if "item_type" in updates and updates["item_type"] is not None:
        updates["item_type"] = updates["item_type"].value
    if "status" in updates and updates["status"] is not None:
        updates["status"] = updates["status"].value

    if updates.get("status") == LostFoundStatus.CLAIMED.value and "claimed_at" not in updates:
        updates["claimed_at"] = datetime.utcnow()

    for key, value in updates.items():
        setattr(item, key, value)

    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lost_found_item(item_id: int, db: Session = Depends(get_db)) -> None:
    item = db.get(LostFoundItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lost & found item not found",
        )

    db.delete(item)
    db.commit()
