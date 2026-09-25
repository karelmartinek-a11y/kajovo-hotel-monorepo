import re
from datetime import date, datetime, time
from io import BytesIO
from zoneinfo import ZoneInfo

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas import (
    BreakfastDailyOverview,
    BreakfastDailySummary,
    BreakfastDietUpdate,
    BreakfastOrderCreate,
    BreakfastOrderRead,
    BreakfastOrderUpdate,
    BreakfastStatus,
)
from app.config import get_settings
from app.db.models import (
    BreakfastImportProcessedAttachment,
    BreakfastOrder,
)
from app.db.session import get_db
from app.security.auth import preferred_locale_for_session
from app.security.rbac import module_access_dependency, parse_identity
from app.services.breakfast.diets import DIET_KEYS, change_diet, enrich_orders, reservation_ids
from app.services.breakfast.sync import (
    BetterHotelBreakfastClient,
    BetterHotelSyncError,
)
from app.services.pdf.breakfast import build_breakfast_schedule_pdf
from app.time_utils import utc_now

router = APIRouter(
    prefix="/api/v1/breakfast",
    tags=["breakfast"],
    dependencies=[Depends(module_access_dependency("breakfast"))],
)


def _room_sort_key(room_number: str | None) -> tuple[int, int | str, str]:
    normalized = (room_number or "").strip()
    match = re.search(r"\d+", normalized)
    if match:
        return (0, int(match.group(0)), normalized.casefold())
    return (1, normalized.casefold(), normalized.casefold())


def _visible_breakfast_orders(orders: list[BreakfastOrder]) -> list[BreakfastOrder]:
    visible = [order for order in orders if int(order.guest_count or 0) > 0]
    return sorted(
        visible,
        key=lambda order: (order.service_date.isoformat(), *_room_sort_key(order.room_number), order.id),
    )


def _build_daily_summary(
    service_date: date,
    orders: list[BreakfastOrder],
    *,
    source_imported_at: datetime | None = None,
) -> BreakfastDailySummary:
    counts = {status: 0 for status in BreakfastStatus}
    for order in orders:
        counts[BreakfastStatus(order.status)] += 1

    return BreakfastDailySummary(
        service_date=service_date,
        total_orders=len(orders),
        total_guests=sum(order.guest_count for order in orders),
        status_counts=counts,
        source_imported_at=source_imported_at,
    )


def _actor_role(request: Request) -> str:
    return getattr(request.state, "actor_role", None) or parse_identity(request)[2]


def _is_breakfast_manager(actor_role: str) -> bool:
    return actor_role in {"admin", "recepce"}


def _today_prague() -> date:
    return utc_now().astimezone(ZoneInfo("Europe/Prague")).date()


def _prague_now() -> datetime:
    return utc_now().astimezone(ZoneInfo("Europe/Prague"))


def _can_mark_served(actor_role: str, service_date: date, now_local: datetime) -> bool:
    if actor_role == "admin":
        return True
    return (
        actor_role in {"recepce", "snídaně"}
        and service_date == now_local.date()
        and time(5, 0) <= now_local.time() <= time(11, 0)
    )


@router.get("", response_model=list[BreakfastOrderRead])
def list_breakfast_orders(
    service_date: date | None = Query(default=None),
    status_filter: BreakfastStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
) -> list[BreakfastOrder]:
    query = select(BreakfastOrder).order_by(
        BreakfastOrder.service_date.desc(), BreakfastOrder.id.desc()
    )

    if service_date:
        query = query.where(BreakfastOrder.service_date == service_date)

    if status_filter:
        query = query.where(BreakfastOrder.status == status_filter.value)

    result = db.scalars(query)
    return enrich_orders(db, _visible_breakfast_orders(list(result)))


@router.get("/daily-summary", response_model=BreakfastDailySummary)
def get_daily_summary(
    service_date: date = Query(...),
    db: Session = Depends(get_db),
) -> BreakfastDailySummary:
    orders = _visible_breakfast_orders(list(
        db.scalars(
            select(BreakfastOrder)
            .where(BreakfastOrder.service_date == service_date)
            .order_by(BreakfastOrder.id.desc())
        )
    ))
    source_imported_at = db.scalar(
        select(func.max(BreakfastImportProcessedAttachment.imported_at)).where(
            BreakfastImportProcessedAttachment.parsed_day == service_date
        )
    )
    return _build_daily_summary(service_date, orders, source_imported_at=source_imported_at)


@router.get("/daily-overview", response_model=BreakfastDailyOverview)
def get_daily_overview(
    service_date: date = Query(...),
    db: Session = Depends(get_db),
) -> BreakfastDailyOverview:
    orders = _visible_breakfast_orders(list(
        db.scalars(
            select(BreakfastOrder)
            .where(BreakfastOrder.service_date == service_date)
            .order_by(BreakfastOrder.id.desc())
        )
    ))
    source_imported_at = db.scalar(
        select(func.max(BreakfastImportProcessedAttachment.imported_at)).where(
            BreakfastImportProcessedAttachment.parsed_day == service_date
        )
    )
    return BreakfastDailyOverview(
        orders=enrich_orders(db, orders),
        summary=_build_daily_summary(service_date, orders, source_imported_at=source_imported_at),
    )


@router.get("/{order_id}", response_model=BreakfastOrderRead)
def get_breakfast_order(order_id: int, db: Session = Depends(get_db)) -> BreakfastOrder:
    order = db.get(BreakfastOrder, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Breakfast order not found",
        )
    return enrich_orders(db, [order])[0]


@router.patch("/{order_id}/reservations/{reservation_id}/diet", response_model=BreakfastOrderRead)
def update_reservation_diet(order_id: int, reservation_id: str, payload: BreakfastDietUpdate,
                            request: Request, db: Session = Depends(get_db)) -> BreakfastOrder:
    if not _is_breakfast_manager(_actor_role(request)):
        raise HTTPException(403, "Diety může měnit jen recepce nebo administrátor.")
    order = db.get(BreakfastOrder, order_id)
    if order is None:
        raise HTTPException(409, "Přehled byl synchronizován. Načtěte aktuální snídaně.")
    if reservation_id not in reservation_ids(order.source_key, order.service_date):
        raise HTTPException(409, "Snídaně nemá ověřenou vazbu na tento pobyt.")
    try:
        aggregates, _, _ = BetterHotelBreakfastClient(get_settings()).build_aggregates(
            service_start=order.service_date, service_end=order.service_date,
        )
    except BetterHotelSyncError as exc:
        raise HTTPException(502, "Vazbu pobytu se nepodařilo ověřit v Better Hotel.") from exc
    aggregate = next((item for item in aggregates if item.source_key == order.source_key
                      and item.room_number == order.room_number and reservation_id in item.reservations), None)
    if aggregate is None:
        raise HTTPException(409, "Pobyt nebo snídaně se změnily. Obnovte data z API.")
    change_diet(db, request, order, reservation_id, kind=payload.kind, enabled=payload.enabled,
                version=payload.version, metadata=aggregate.reservations[reservation_id])
    db.refresh(order)
    return enrich_orders(db, [order])[0]


@router.post("", response_model=BreakfastOrderRead, status_code=status.HTTP_201_CREATED)
def create_breakfast_order(
    payload: BreakfastOrderCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> BreakfastOrder:
    actor_role = _actor_role(request)
    if actor_role not in {"admin", "recepce"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Breakfast planning requires recepce/admin role",
        )

    payload_data = payload.model_dump()
    if any(payload_data.get(key) for key in DIET_KEYS):
        raise HTTPException(409, "Diety lze nastavit pouze u ověřené rezervace z API.")
    payload_data["status"] = payload.status.value
    order = BreakfastOrder(**payload_data)
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.put("/{order_id}", response_model=BreakfastOrderRead)
def update_breakfast_order(
    order_id: int,
    payload: BreakfastOrderUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> BreakfastOrder:
    order = db.get(BreakfastOrder, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Breakfast order not found",
        )

    updates = payload.model_dump(exclude_unset=True)
    expected_updated_at = updates.pop("expected_updated_at", None)
    actor_role = _actor_role(request)
    diet_keys = {"diet_no_gluten", "diet_no_milk", "diet_no_pork"}
    is_manager = _is_breakfast_manager(actor_role)

    if expected_updated_at is not None and order.updated_at is not None and order.updated_at != expected_updated_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Snídaně byla mezitím změněna jiným požadavkem. Načtěte prosím aktuální stav.",
        )

    if diet_keys.intersection(updates.keys()) and not is_manager:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diet updates are limited to recepce/admin roles",
        )
    if diet_keys.intersection(updates):
        raise HTTPException(409, "Diety se mění podle rezervace, nikoli denní objednávky. Obnovte aplikaci.")

    if not is_manager:
        disallowed_keys = set(updates) - {"status"}
        if disallowed_keys:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Breakfast role can only mark orders as served",
            )

    if "status" in updates and updates["status"] is not None:
        next_status = updates["status"].value
        if not is_manager and next_status != BreakfastStatus.SERVED.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Breakfast role can only mark orders as served",
            )
        if actor_role not in {"admin", "recepce"} and next_status != BreakfastStatus.SERVED.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Pouze recepce nebo admin mohou vracet vydané snídaně zpět.",
            )
        if actor_role not in {"admin", "recepce"} and not _can_mark_served(actor_role, order.service_date, _prague_now()):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Snídani lze vydat jen pro dnešní den mezi 5:00 a 11:00.",
            )
        updates["status"] = next_status

    for key, value in updates.items():
        setattr(order, key, value)

    db.add(order)
    db.commit()
    db.refresh(order)
    return enrich_orders(db, [order])[0]


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_breakfast_order(order_id: int, request: Request, db: Session = Depends(get_db)) -> None:
    actor_role = _actor_role(request)
    if actor_role not in {"admin", "recepce"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Breakfast deletion requires recepce/admin role",
        )

    order = db.get(BreakfastOrder, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Breakfast order not found",
        )

    db.delete(order)
    db.commit()


@router.post("/reactivate-all", status_code=status.HTTP_204_NO_CONTENT)
def reactivate_all_breakfast_orders(
    request: Request,
    service_date: date = Query(...),
    db: Session = Depends(get_db),
) -> None:
    actor_role = _actor_role(request)
    if actor_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Breakfast reactivation requires admin role",
        )

    db.query(BreakfastOrder).filter(
        BreakfastOrder.service_date == service_date,
        BreakfastOrder.status == BreakfastStatus.SERVED.value,
    ).update({BreakfastOrder.status: BreakfastStatus.PENDING.value})
    db.commit()


@router.delete("/day/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_breakfast_orders_for_day(
    request: Request,
    service_date: date = Query(...),
    db: Session = Depends(get_db),
) -> None:
    actor_role = _actor_role(request)
    if actor_role not in {"admin", "recepce"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Breakfast deletion requires recepce/admin role",
        )

    db.query(BreakfastOrder).filter(BreakfastOrder.service_date == service_date).delete(
        synchronize_session=False
    )
    db.commit()


@router.delete("/period/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_breakfast_orders_for_period(
    request: Request,
    date_from: date = Query(...),
    date_to: date = Query(...),
    db: Session = Depends(get_db),
) -> None:
    actor_role = _actor_role(request)
    if actor_role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Breakfast period deletion requires admin role",
        )
    if date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date from must be before or equal to date to",
        )

    db.query(BreakfastOrder).filter(
        BreakfastOrder.service_date >= date_from,
        BreakfastOrder.service_date <= date_to,
    ).delete(synchronize_session=False)
    db.commit()


@router.get("/export/daily")
def export_breakfast_daily_pdf(
    request: Request,
    service_date: date = Query(...),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    actor_role = _actor_role(request)
    if not _is_breakfast_manager(actor_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Breakfast export requires recepce/admin role",
        )

    orders = _visible_breakfast_orders(list(
        db.scalars(
            select(BreakfastOrder)
            .where(BreakfastOrder.service_date == service_date)
            .order_by(BreakfastOrder.room_number.asc())
        )
    ))

    pdf_bytes = build_breakfast_schedule_pdf(orders, service_date=service_date, locale=preferred_locale_for_session(request, db))
    filename = f"breakfast-{service_date.isoformat()}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
