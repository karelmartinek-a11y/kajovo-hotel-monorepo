from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import (
    LostFoundItemCreate,
    LostFoundItemRead,
    LostFoundItemType,
    LostFoundItemUpdate,
    LostFoundStatus,
    MediaPhotoRead,
)
from app.config import get_settings
from app.db.models import LostFoundItem, LostFoundPhoto
from app.db.session import get_db
from app.media.storage import MediaStorage
from app.security.rbac import module_access_dependency

router = APIRouter(
    prefix="/api/v1/lost-found",
    tags=["lost-found"],
    dependencies=[Depends(module_access_dependency("lost_found"))],
)


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
    item = db.scalar(
        select(LostFoundItem).where(LostFoundItem.id == item_id).options(selectinload(LostFoundItem.photos))
    )
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


@router.get("/{item_id}/photos", response_model=list[MediaPhotoRead])
def list_lost_found_photos(item_id: int, db: Session = Depends(get_db)) -> list[LostFoundPhoto]:
    item = db.scalar(
        select(LostFoundItem).where(LostFoundItem.id == item_id).options(selectinload(LostFoundItem.photos))
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lost & found item not found")
    return list(item.photos)


@router.post("/{item_id}/photos", response_model=list[MediaPhotoRead])
def upload_lost_found_photos(
    item_id: int,
    photos: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
) -> list[LostFoundPhoto]:
    item = db.get(LostFoundItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lost & found item not found")
    if len(photos) > 5:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 5 photos")

    storage = MediaStorage(get_settings().media_root)
    start_idx = len(item.photos)
    for offset, upload in enumerate(photos):
        stored = storage.store_image(
            category="lost-found",
            resource_id=item.id,
            src_file=upload.file,
            src_filename=upload.filename or f"photo-{offset + 1}.jpg",
        )
        db.add(
            LostFoundPhoto(
                item_id=item.id,
                sort_order=start_idx + offset,
                file_path=stored.original_relpath,
                thumb_path=stored.thumb_relpath,
                mime_type=upload.content_type or "image/jpeg",
                size_bytes=stored.bytes,
            )
        )
    db.commit()
    return list(
        db.scalars(
            select(LostFoundPhoto)
            .where(LostFoundPhoto.item_id == item.id)
            .order_by(LostFoundPhoto.sort_order.asc())
        )
    )


@router.get("/{item_id}/photos/{photo_id}/{kind}")
def get_lost_found_photo(
    item_id: int,
    photo_id: int,
    kind: str,
    db: Session = Depends(get_db),
):
    photo = db.scalar(
        select(LostFoundPhoto).where(LostFoundPhoto.id == photo_id, LostFoundPhoto.item_id == item_id)
    )
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    if kind not in {"thumb", "original"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported kind")
    rel = photo.thumb_path if kind == "thumb" else photo.file_path
    storage = MediaStorage(get_settings().media_root)
    path = storage.resolve(rel)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media file not found")
    return FileResponse(path, media_type=photo.mime_type)
