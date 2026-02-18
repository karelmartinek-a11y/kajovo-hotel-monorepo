from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import (
    BreakfastDailySummary,
    BreakfastOrderCreate,
    BreakfastOrderRead,
    BreakfastOrderUpdate,
    BreakfastStatus,
)
from app.db.models import BreakfastOrder
from app.db.session import get_db

router = APIRouter(prefix="/api/v1/breakfast", tags=["breakfast"])


def _build_daily_summary(service_date: date, orders: list[BreakfastOrder]) -> BreakfastDailySummary:
    counts = {status: 0 for status in BreakfastStatus}
    for order in orders:
        counts[BreakfastStatus(order.status)] += 1

    return BreakfastDailySummary(
        service_date=service_date,
        total_orders=len(orders),
        total_guests=sum(order.guest_count for order in orders),
        status_counts=counts,
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
    return list(result)


@router.get("/daily-summary", response_model=BreakfastDailySummary)
def get_daily_summary(
    service_date: date = Query(...),
    db: Session = Depends(get_db),
) -> BreakfastDailySummary:
    orders = list(
        db.scalars(
            select(BreakfastOrder)
            .where(BreakfastOrder.service_date == service_date)
            .order_by(BreakfastOrder.id.desc())
        )
    )
    return _build_daily_summary(service_date, orders)


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
    db: Session = Depends(get_db),
) -> BreakfastOrder:
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
    db: Session = Depends(get_db),
) -> BreakfastOrder:
    order = db.get(BreakfastOrder, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Breakfast order not found",
        )

    updates = payload.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] is not None:
        updates["status"] = updates["status"].value

    for key, value in updates.items():
        setattr(order, key, value)

    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_breakfast_order(order_id: int, db: Session = Depends(get_db)) -> None:
    order = db.get(BreakfastOrder, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Breakfast order not found",
        )

    db.delete(order)
    db.commit()
