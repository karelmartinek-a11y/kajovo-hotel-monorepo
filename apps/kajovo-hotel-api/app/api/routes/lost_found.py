from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
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
from app.security.auth import SESSION_COOKIE_NAME, read_session_cookie
from app.security.rbac import module_access_dependency, parse_identity, require_actor_type
from app.time_utils import utc_now

router = APIRouter(
    prefix="/api/v1/lost-found",
    tags=["lost-found"],
    dependencies=[Depends(module_access_dependency("lost_found"))],
)


@router.get("", response_model=list[LostFoundItemRead])
def list_lost_found_items(
    request: Request,
    item_type: LostFoundItemType | None = Query(default=None, alias="type"),
    status_filter: LostFoundStatus | None = Query(default=None, alias="status"),
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[LostFoundItem]:
    query = (
        select(LostFoundItem)
        .options(selectinload(LostFoundItem.photos))
        .order_by(LostFoundItem.event_at.desc(), LostFoundItem.id.desc())
    )
    actor_role = getattr(request.state, "actor_role", "") or parse_identity(request)[2]
    session = read_session_cookie(request.cookies.get(SESSION_COOKIE_NAME))
    actor_type = str((session or {}).get("actor_type") or ("portal" if session else ""))

    if actor_type == "portal" and status_filter is None:
        query = query.where(LostFoundItem.status == LostFoundStatus.NEW.value)

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
    tags = payload_data.pop("tags", [])
    item = LostFoundItem(**payload_data)
    item.tags = tags
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=LostFoundItemRead)
def update_lost_found_item(
    item_id: int,
    payload: LostFoundItemUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> LostFoundItem:
    item = db.get(LostFoundItem, item_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lost & found item not found",
        )

    updates = payload.model_dump(exclude_unset=True)
    actor_role = getattr(request.state, "actor_role", "") or parse_identity(request)[2]
    if actor_role == "recepce":
        allowed_fields = {"status"}
        if set(updates) - allowed_fields:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reception can only mark lost & found items as processed",
            )
        if updates.get("status") not in {LostFoundStatus.CLAIMED, LostFoundStatus.CLAIMED.value}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Reception can only mark lost & found items as processed",
            )
    if "item_type" in updates and updates["item_type"] is not None:
        updates["item_type"] = updates["item_type"].value
    if "status" in updates and updates["status"] is not None:
        updates["status"] = updates["status"].value
    tags = updates.pop("tags", None)

    if updates.get("status") == LostFoundStatus.CLAIMED.value and "claimed_at" not in updates:
        updates["claimed_at"] = utc_now()
    if updates.get("status") == LostFoundStatus.NEW.value:
        updates["claimed_at"] = None
        updates["returned_at"] = None

    for key, value in updates.items():
        setattr(item, key, value)
    if tags is not None:
        item.tags = tags

    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lost_found_item(item_id: int, db: Session = Depends(get_db), _admin: None = Depends(require_actor_type("admin"))) -> None:
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
    if len(photos) > 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 3 photos")

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
