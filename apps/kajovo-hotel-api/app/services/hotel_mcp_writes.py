"""The same breakfast and lost-property actions used by the native routes."""

from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.routes import breakfast, issues, lost_found
from app.api.schemas import (
    BreakfastOrderUpdate,
    BreakfastStatus,
    IssueUpdate,
    LostFoundItemCreate,
    LostFoundItemUpdate,
)
from app.db.models import BreakfastOrder, Issue, LostFoundItem
from app.security.rbac import require_actor_type
from app.services.hotel_mcp_file import ChatFile, download_photo


class BreakfastPatch(BaseModel):
    service_date: date | None = None
    room_number: str | None = Field(default=None, min_length=1, max_length=32)
    guest_name: str | None = Field(default=None, min_length=1, max_length=255)
    guest_count: int | None = Field(default=None, ge=1, le=20)
    status: BreakfastStatus | None = None

    def updates(self, expected_updated_at: datetime) -> BreakfastOrderUpdate:
        changes = self.model_dump(exclude_none=True)
        if not changes:
            raise HTTPException(400, "Vyber alespoň jedno pole ke změně.")
        return BreakfastOrderUpdate(expected_updated_at=expected_updated_at, **changes)


def receipt(record: BreakfastOrder | Issue | LostFoundItem) -> dict[str, Any]:
    return {
        "record_id": record.id,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


def update_breakfast(
    db: Session,
    request: Request,
    order_id: int,
    changes: BreakfastPatch,
    expected_updated_at: datetime,
) -> dict[str, Any]:
    # Lock the selected record before comparing the same timestamp the native route uses.
    order = db.get(BreakfastOrder, order_id, with_for_update=True)
    if order is None:
        raise HTTPException(404, "Objednávka nebyla nalezena.")
    return receipt(
        breakfast.update_breakfast_order(
            order_id, changes.updates(expected_updated_at), request, db
        )
    )


def delete_breakfast(db: Session, request: Request, order_id: int) -> dict[str, Any]:
    breakfast.delete_breakfast_order(order_id, request, db)
    return {"record_id": order_id}


def create_lost_found(db: Session, payload: LostFoundItemCreate) -> dict[str, Any]:
    return receipt(lost_found.create_lost_found_item(payload, db))


def update_lost_found(
    db: Session,
    request: Request,
    item_id: int,
    payload: LostFoundItemUpdate,
    expected_updated_at: datetime,
) -> dict[str, Any]:
    item = db.get(LostFoundItem, item_id, with_for_update=True)
    if item is None:
        raise HTTPException(404, "Záznam nebyl nalezen.")
    if item.updated_at != expected_updated_at:
        raise HTTPException(409, "Záznam se změnil. Načti ho znovu.")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "Vyber alespoň jedno pole ke změně.")
    required = {"item_type", "status", "description", "category", "location", "event_at"}
    if any(key in required and value is None for key, value in changes.items()):
        raise HTTPException(400, "Povinné pole nelze vymazat.")
    return receipt(lost_found.update_lost_found_item(item_id, payload, request, db))


def delete_lost_found(db: Session, request: Request, item_id: int) -> dict[str, Any]:
    require_actor_type("admin")(request)
    lost_found.delete_lost_found_item(item_id, db, None)
    return {"record_id": item_id}


def add_lost_found_photo(db: Session, item_id: int, file: ChatFile) -> dict[str, Any]:
    item = db.get(LostFoundItem, item_id, with_for_update=True)
    if item is None:
        raise HTTPException(404, "Záznam nebyl nalezen.")
    previous_ids = {photo.id for photo in item.photos}
    upload = download_photo(file)
    try:
        photos = lost_found.upload_lost_found_photos(item_id, [upload], db)
    finally:
        upload.file.close()
    added = [photo.id for photo in photos if photo.id not in previous_ids]
    if len(added) != 1:
        raise RuntimeError("Foto záznam nelze jednoznačně přečíst.")
    return {"record_id": item_id, "photo_id": added[0]}


def update_issue(
    db: Session,
    request: Request,
    issue_id: int,
    payload: IssueUpdate,
    expected_updated_at: datetime,
) -> dict[str, Any]:
    issue = db.get(Issue, issue_id, with_for_update=True)
    if issue is None:
        raise HTTPException(404, "Závada nebyla nalezena.")
    if issue.updated_at != expected_updated_at:
        raise HTTPException(409, "Závada se změnila. Načti ji znovu.")
    updated = payload.model_dump(exclude_unset=True)
    if not updated:
        raise HTTPException(400, "Vyber alespoň jedno pole ke změně.")
    required = {"title", "location", "priority", "status"}
    if any(field in required and value is None for field, value in updated.items()):
        raise HTTPException(400, "Povinné pole nelze vymazat.")
    return receipt(issues.update_issue(issue_id, payload, request, db))


def delete_issue(db: Session, request: Request, issue_id: int) -> dict[str, Any]:
    require_actor_type("admin")(request)
    issues.delete_issue(issue_id, db, None)
    return {"record_id": issue_id}


def add_issue_photo(db: Session, request: Request, issue_id: int, file: ChatFile) -> dict[str, Any]:
    issue = db.get(Issue, issue_id, with_for_update=True)
    if issue is None:
        raise HTTPException(404, "Závada nebyla nalezena.")
    previous_ids = {photo.id for photo in issue.photos}
    if len(previous_ids) >= 3:
        raise HTTPException(400, "K závadě lze přidat nejvýše tři fotografie.")
    upload = download_photo(file)
    try:
        photos = issues.upload_issue_photos(issue_id, request, [upload], db)
    finally:
        upload.file.close()
    added = [photo.id for photo in photos if photo.id not in previous_ids]
    if len(added) != 1:
        raise RuntimeError("Fotografii závady nelze jednoznačně přečíst.")
    return {"record_id": issue_id, "photo_id": added[0]}


def reactivate_breakfast_day(request: Request, db: Session, day: date) -> dict[str, Any]:
    breakfast.reactivate_all_breakfast_orders(request, day, db)
    return {}


def delete_breakfast_days(
    request: Request,
    db: Session,
    start_day: date,
    end_day: date | None,
) -> dict[str, Any]:
    if end_day is None:
        breakfast.delete_breakfast_orders_for_day(request, start_day, db)
    else:
        breakfast.delete_breakfast_orders_for_period(request, start_day, end_day, db)
    return {}
