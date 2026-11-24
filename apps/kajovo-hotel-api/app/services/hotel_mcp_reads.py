"""Small read models for the Hotel MCP, backed by the business APIs."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Literal
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.api.routes import breakfast, issues, lost_found
from app.api.schemas import (
    BreakfastDailySummary,
    BreakfastReservationRead,
    LostFoundWhatsappRead,
)
from app.db.models import (
    BreakfastOrder,
    BreakfastStatus,
    Issue,
    IssuePriority,
    IssueStatus,
    LostFoundItem,
    LostFoundItemType,
    LostFoundStatus,
)
from app.security.hotel_oauth import CML

SECTION = CML + "/sections/hotel"
PRAGUE = ZoneInfo("Europe/Prague")


class BreakfastItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    room_number: str
    guest_count: int
    status: BreakfastStatus


class BreakfastDay(BaseModel):
    summary: BreakfastDailySummary
    items: list[BreakfastItem]
    next_after: int | None = None


class BreakfastOrderDetail(BreakfastItem):
    service_date: date
    updated_at: datetime | None
    guest_name: str
    note: str | None
    diet_no_gluten: bool
    diet_no_milk: bool
    diet_no_pork: bool
    reservations: list[BreakfastReservationRead] | None = None


def breakfast_day(db: Session, day: date, after: int, limit: int) -> BreakfastDay:
    summary = breakfast.get_daily_summary(service_date=day, db=db)
    orders = list(
        db.scalars(
            select(BreakfastOrder)
            .where(
                BreakfastOrder.service_date == day,
                BreakfastOrder.id > after,
                BreakfastOrder.guest_count > 0,
            )
            .order_by(BreakfastOrder.id)
            .limit(limit + 1)
        )
    )
    return BreakfastDay(
        summary=summary,
        items=[BreakfastItem.model_validate(row) for row in orders[:limit]],
        next_after=orders[limit - 1].id if len(orders) > limit else None,
    )


def breakfast_order(db: Session, order_id: int, include_reservations: bool) -> BreakfastOrderDetail:
    order = (
        breakfast.get_breakfast_order(order_id, db)
        if include_reservations
        else db.get(BreakfastOrder, order_id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Objednávka nebyla nalezena.")
    return BreakfastOrderDetail(
        **BreakfastItem.model_validate(order).model_dump(),
        service_date=order.service_date,
        updated_at=order.updated_at,
        guest_name=order.guest_name,
        note=order.note,
        diet_no_gluten=order.diet_no_gluten,
        diet_no_milk=order.diet_no_milk,
        diet_no_pork=order.diet_no_pork,
        reservations=(
            [BreakfastReservationRead.model_validate(row) for row in order.reservations]
            if include_reservations
            else None
        ),
    )


class FileLink(BaseModel):
    href: str
    media_type: str
    kind: Literal["live_pdf", "photo", "placeholder"]


def breakfast_export(day: date) -> FileLink:
    query = urlencode({"service_date": day.isoformat()})
    return FileLink(
        href=f"{SECTION}/api/v1/breakfast/export/daily?{query}",
        media_type="application/pdf",
        kind="live_pdf",
    )


class LostFoundSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_type: LostFoundItemType
    category: str
    event_at: datetime
    status: LostFoundStatus
    room_number: str | None


class LostFoundPage(BaseModel):
    items: list[LostFoundSummary]
    next_before_id: int | None = None


def lost_found_list(
    db: Session,
    *,
    item_type: LostFoundItemType | None,
    status: LostFoundStatus | None,
    category: str | None,
    room_number: str | None,
    before_id: int | None,
    limit: int,
    start_day: date | None = None,
    end_day: date | None = None,
) -> LostFoundPage:
    if start_day is not None and end_day is not None and start_day > end_day:
        raise HTTPException(status_code=400, detail="Od musí být nejpozději do.")
    query = select(LostFoundItem)
    if start_day is not None and start_day > date.min:
        lower = datetime.combine(start_day, time.min, PRAGUE).astimezone(timezone.utc)
        query = query.where(LostFoundItem.event_at >= lower)
    if end_day is not None and end_day < date.max:
        upper = datetime.combine(end_day + timedelta(days=1), time.min, PRAGUE).astimezone(
            timezone.utc
        )
        query = query.where(LostFoundItem.event_at < upper)
    for column, value in (
        (LostFoundItem.item_type, item_type),
        (LostFoundItem.status, status),
        (LostFoundItem.category, category),
        (LostFoundItem.room_number, room_number),
    ):
        if value is not None:
            query = query.where(column == value)
    if before_id is not None:
        cursor = db.scalar(query.where(LostFoundItem.id == before_id))
        if cursor is None:
            raise HTTPException(
                status_code=409, detail="Položka kurzoru zmizela. Načti první stránku."
            )
        query = query.where(
            or_(
                LostFoundItem.event_at < cursor.event_at,
                and_(LostFoundItem.event_at == cursor.event_at, LostFoundItem.id < cursor.id),
            )
        )
    rows = list(
        db.scalars(
            query.order_by(LostFoundItem.event_at.desc(), LostFoundItem.id.desc()).limit(limit + 1)
        )
    )
    return LostFoundPage(
        items=[LostFoundSummary.model_validate(row) for row in rows[:limit]],
        next_before_id=rows[limit - 1].id if len(rows) > limit else None,
    )


class PhotoInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    mime_type: str
    size_bytes: int


class Handover(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    claimant_name: str | None
    claimant_contact: str | None
    handover_note: str | None
    claimed_at: datetime | None
    returned_at: datetime | None


class LostFoundDetail(LostFoundSummary):
    description: str
    location: str
    tags: list[str]
    updated_at: datetime | None
    photos: list[PhotoInfo]
    whatsapp_notification: LostFoundWhatsappRead | None = None
    handover: Handover | None = None


def lost_found_detail(db: Session, item_id: int, include_handover: bool) -> LostFoundDetail:
    item = lost_found.get_lost_found_item(item_id, db)
    result = LostFoundDetail.model_validate(item, from_attributes=True)
    if include_handover:
        result.handover = Handover.model_validate(item)
    return result


def lost_found_photo(
    db: Session,
    item_id: int,
    photo_id: int,
    kind: Literal["thumb", "original"],
) -> FileLink:
    response = lost_found.get_lost_found_photo(item_id, photo_id, kind, download=False, db=db)
    return FileLink(
        href=f"{SECTION}/api/v1/lost-found/{item_id}/photos/{photo_id}/{kind}",
        media_type=response.media_type,
        kind="photo" if hasattr(response, "path") else "placeholder",
    )


class IssueSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    location: str
    room_number: str | None
    priority: IssuePriority
    status: IssueStatus
    updated_at: datetime


class IssuePage(BaseModel):
    items: list[IssueSummary]
    next_before_id: int | None = None


class IssueDetail(IssueSummary):
    description: str | None
    assignee: str | None
    created_at: datetime
    in_progress_at: datetime | None
    resolved_at: datetime | None
    closed_at: datetime | None
    photos: list[PhotoInfo]


def issue_list(
    db: Session,
    *,
    priority: IssuePriority | None,
    status: IssueStatus | None,
    location: str | None,
    room_number: str | None,
    before_id: int | None,
    limit: int,
) -> IssuePage:
    query = select(Issue)
    for column, value in (
        (Issue.priority, priority),
        (Issue.status, status),
        (Issue.location, location),
        (Issue.room_number, room_number),
    ):
        if value is not None:
            query = query.where(column == value)
    if before_id is not None:
        cursor = query.where(Issue.id == before_id)
        if db.scalar(cursor.with_only_columns(Issue.id)) is None:
            raise HTTPException(409, "Položka kurzoru zmizela. Načti první stránku.")
        timestamp = cursor.with_only_columns(Issue.created_at).correlate(None).scalar_subquery()
        query = query.where(
            or_(
                Issue.created_at < timestamp,
                and_(Issue.created_at == timestamp, Issue.id < before_id),
            )
        )
    rows = list(
        db.scalars(query.order_by(Issue.created_at.desc(), Issue.id.desc()).limit(limit + 1))
    )
    return IssuePage(
        items=[IssueSummary.model_validate(row) for row in rows[:limit]],
        next_before_id=rows[limit - 1].id if len(rows) > limit else None,
    )


def issue_detail(db: Session, issue_id: int) -> IssueDetail:
    return IssueDetail.model_validate(issues.get_issue(issue_id, db))


def issue_photo(
    db: Session, issue_id: int, photo_id: int, kind: Literal["thumb", "original"]
) -> FileLink:
    response = issues.get_issue_photo(issue_id, photo_id, kind, download=False, db=db)
    return FileLink(
        href=f"{SECTION}/api/v1/issues/{issue_id}/photos/{photo_id}/{kind}",
        media_type=response.media_type,
        kind="photo" if hasattr(response, "path") else "placeholder",
    )
