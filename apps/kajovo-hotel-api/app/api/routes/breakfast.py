import json
import os
import re
from datetime import date, datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas import (
    BreakfastDailySummary,
    BreakfastImportItem,
    BreakfastImportResponse,
    BreakfastManualRefreshJobRead,
    BreakfastManualRefreshProgressItem,
    BreakfastManualRefreshRequest,
    BreakfastOrderCreate,
    BreakfastOrderRead,
    BreakfastOrderUpdate,
    BreakfastStatus,
)
from app.config import get_settings
from app.db.models import (
    BreakfastImportProcessedAttachment,
    BreakfastManualRefreshJob,
    BreakfastOrder,
)
from app.db.session import get_db
from app.security.rbac import module_access_dependency, parse_identity
from app.services.breakfast.manual_refresh import (
    get_manual_breakfast_refresh_job,
    start_manual_breakfast_refresh,
)
from app.services.breakfast.parser import parse_breakfast_pdf
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


def _parse_diet_overrides(raw: str | None) -> dict[str, dict[str, bool]]:
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}

    overrides: dict[str, dict[str, bool]] = {}
    if isinstance(payload, dict):
        items = payload.values()
    elif isinstance(payload, list):
        items = payload
    else:
        return {}

    for item in items:
        if not isinstance(item, dict):
            continue
        room = str(item.get("room") or "").strip()
        if not room:
            continue
        overrides[room] = {
            "diet_no_gluten": bool(item.get("diet_no_gluten", False)),
            "diet_no_milk": bool(item.get("diet_no_milk", False)),
            "diet_no_pork": bool(item.get("diet_no_pork", False)),
        }
    return overrides


def _today_prague() -> date:
    return utc_now().astimezone(ZoneInfo("Europe/Prague")).date()


def _read_manual_refresh_job(job: BreakfastManualRefreshJob) -> BreakfastManualRefreshJobRead:
    progress: list[BreakfastManualRefreshProgressItem] = []
    if job.progress_json:
        try:
            payload = json.loads(job.progress_json)
        except json.JSONDecodeError:
            payload = []
        if isinstance(payload, list):
            for item in payload:
                if not isinstance(item, dict):
                    continue
                try:
                    progress.append(
                        BreakfastManualRefreshProgressItem(
                            at=datetime.fromisoformat(str(item.get("at"))),
                            step=str(item.get("step") or "runner"),
                            message=str(item.get("message") or ""),
                        )
                    )
                except ValueError:
                    continue
    return BreakfastManualRefreshJobRead(
        id=job.id,
        job_key=job.job_key,
        service_date=job.service_date,
        status=job.status,
        progress=progress,
        message=job.message,
        error_message=job.error_message,
        imported_count=job.imported_count,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
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
    return _visible_breakfast_orders(list(result))


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


@router.post("/manual-refresh", response_model=BreakfastManualRefreshJobRead, status_code=status.HTTP_202_ACCEPTED)
def manual_refresh_breakfast(
    payload: BreakfastManualRefreshRequest,
    db: Session = Depends(get_db),
) -> BreakfastManualRefreshJobRead:
    job = start_manual_breakfast_refresh(db, payload.service_date)
    return _read_manual_refresh_job(job)


@router.get("/manual-refresh/{job_id}", response_model=BreakfastManualRefreshJobRead)
def get_manual_refresh_job(
    job_id: int,
    db: Session = Depends(get_db),
) -> BreakfastManualRefreshJobRead:
    job = get_manual_breakfast_refresh_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manual refresh job not found")
    return _read_manual_refresh_job(job)


@router.get("/{order_id}", response_model=BreakfastOrderRead)
def get_breakfast_order(order_id: int, db: Session = Depends(get_db)) -> BreakfastOrder:
    order = db.get(BreakfastOrder, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Breakfast order not found",
        )
    return order


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
    actor_role = _actor_role(request)
    diet_keys = {"diet_no_gluten", "diet_no_milk", "diet_no_pork"}
    is_manager = _is_breakfast_manager(actor_role)

    if diet_keys.intersection(updates.keys()) and not is_manager:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diet updates are limited to recepce/admin roles",
        )

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
        if (
            order.status == BreakfastStatus.SERVED.value
            and next_status == BreakfastStatus.PENDING.value
            and not is_manager
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Breakfast reactivation requires recepce/admin role",
            )
        updates["status"] = next_status

    for key, value in updates.items():
        setattr(order, key, value)

    db.add(order)
    db.commit()
    db.refresh(order)
    return order


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
    if actor_role not in {"admin", "recepce"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Breakfast reactivation requires recepce/admin role",
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

    pdf_bytes = build_breakfast_schedule_pdf(orders, service_date=service_date)
    filename = f"breakfast-{service_date.isoformat()}.pdf"
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/import", response_model=BreakfastImportResponse)
def import_breakfast_pdf(
    request: Request,
    save: bool = Form(False),
    overrides: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> BreakfastImportResponse:
    actor_role = _actor_role(request)
    if not _is_breakfast_manager(actor_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Breakfast import requires recepce/admin role",
        )

    filename = (file.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Expected PDF file")

    pdf_bytes = file.file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF is empty")

    try:
        parsed_day, rows = parse_breakfast_pdf(pdf_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    diet_overrides = _parse_diet_overrides(overrides)
    items = []
    for row in rows:
        override = diet_overrides.get(str(row.room), {})
        items.append(
            BreakfastImportItem(
                room=int(row.room),
                count=int(row.breakfast_count),
                guest_name=row.guest_name,
                diet_no_gluten=bool(override.get("diet_no_gluten", False)),
                diet_no_milk=bool(override.get("diet_no_milk", False)),
                diet_no_pork=bool(override.get("diet_no_pork", False)),
            )
        )

    if save:
        today = _today_prague()
        target_days = sorted({row.day for row in rows if row.day >= today})
        for target_day in target_days:
            db.query(BreakfastOrder).filter(BreakfastOrder.service_date == target_day).delete(
                synchronize_session=False
            )
        for row in rows:
            if row.day < today:
                continue
            override = diet_overrides.get(str(row.room), {})
            db.add(
                BreakfastOrder(
                    service_date=row.day,
                    room_number=row.room,
                    guest_name=row.guest_name or f"Pokoj {row.room}",
                    guest_count=max(1, int(row.breakfast_count)),
                    status=BreakfastStatus.PENDING.value,
                    note="Import PDF",
                    diet_no_gluten=bool(override.get("diet_no_gluten", False)),
                    diet_no_milk=bool(override.get("diet_no_milk", False)),
                    diet_no_pork=bool(override.get("diet_no_pork", False)),
                )
            )
        db.commit()

        settings = get_settings()
        archive_dir = f"{settings.media_root}/breakfast/imports"
        os.makedirs(archive_dir, exist_ok=True)
        with open(f"{archive_dir}/{parsed_day.isoformat()}.pdf", "wb") as handle:
            handle.write(pdf_bytes)

    return BreakfastImportResponse(
        date=parsed_day,
        status="FOUND" if items else "MISSING",
        saved=save,
        items=items,
    )
