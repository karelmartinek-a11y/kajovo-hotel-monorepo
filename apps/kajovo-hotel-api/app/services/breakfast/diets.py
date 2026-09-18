"""Reservation-bound diets; daily order flags are a materialized OR projection."""

from datetime import date

from fastapi import HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit_utils import audit_detail_json
from app.db.models import AuditTrail, BreakfastOrder, ReservationBreakfastDiet
from app.time_utils import utc_now

DIET_KEYS = ("diet_no_gluten", "diet_no_milk", "diet_no_pork")


def reservation_ids(source_key: str | None, service_date: date) -> list[str]:
    parts = (source_key or "").split("|")
    if len(parts) < 2 or parts[0] != service_date.isoformat():
        return []
    ids = parts[1:]
    if any(not value.strip() or value == "unknown" or len(value) > 128 for value in ids):
        return []
    return sorted(set(ids))


def enrich_orders(db: Session, orders: list[BreakfastOrder]) -> list[BreakfastOrder]:
    ids = {value for order in orders for value in reservation_ids(order.source_key, order.service_date)}
    diets = {row.reservation_id: row for row in db.scalars(
        select(ReservationBreakfastDiet).where(ReservationBreakfastDiet.reservation_id.in_(ids))
    )} if ids else {}
    for order in orders:
        order.reservations = [diets[value] for value in reservation_ids(order.source_key, order.service_date) if value in diets]
    return orders


def project_flags(db: Session, orders: list[BreakfastOrder]) -> None:
    for order in enrich_orders(db, orders):
        if not order.reservations:
            continue
        for key in DIET_KEYS:
            setattr(order, key, any(getattr(row, key) for row in order.reservations
                                   if (row.arrival is None or order.service_date > row.arrival)
                                   and (row.departure is None or order.service_date <= row.departure)))


def ensure_diets(db: Session, metadata: dict[str, dict]) -> None:
    """Acquire locks in stable order, shared by imports and interactive updates."""
    for reservation_id in sorted(metadata):
        row = db.get(ReservationBreakfastDiet, reservation_id)
        if row is None:
            try:
                with db.begin_nested():
                    db.add(ReservationBreakfastDiet(reservation_id=reservation_id))
                    db.flush()
            except IntegrityError:
                pass
        row = db.scalar(select(ReservationBreakfastDiet).where(
            ReservationBreakfastDiet.reservation_id == reservation_id
        ).with_for_update().execution_options(populate_existing=True))
        for key, value in metadata[reservation_id].items():
            setattr(row, key, value)
    db.flush()


def change_diet(db: Session, request: Request, order: BreakfastOrder, reservation_id: str,
                *, kind: str, enabled: bool, version: int, metadata: dict | None = None) -> None:
    if request.state.actor_role not in {"admin", "recepce"}:
        raise HTTPException(403, "Diety může měnit jen recepce nebo administrátor.")
    ids = reservation_ids(order.source_key, order.service_date)
    if reservation_id not in ids:
        raise HTTPException(409, "Snídaně nemá ověřenou vazbu na tento pobyt. Obnovte data z API.")
    # Lock constituents of every affected day in the same order as synchronization.
    related_query = select(BreakfastOrder).where(
        (BreakfastOrder.source_key + "|").contains(f"|{reservation_id}|", autoescape=True)
    )
    related = db.scalars(related_query).all()
    lock_ids = {value for item in related for value in reservation_ids(item.source_key, item.service_date)}
    db.scalars(select(ReservationBreakfastDiet).where(
        ReservationBreakfastDiet.reservation_id.in_(lock_ids)
    ).order_by(ReservationBreakfastDiet.reservation_id).with_for_update().execution_options(populate_existing=True)).all()
    if db.scalar(select(BreakfastOrder.id).where(BreakfastOrder.id == order.id,
                                                BreakfastOrder.source_key == order.source_key)) is None:
        raise HTTPException(409, "Přehled byl synchronizován. Načtěte aktuální snídaně.")
    row = db.get(ReservationBreakfastDiet, reservation_id)
    if row is None or row.version != version:
        raise HTTPException(409, "Diety pobytu byly změněny. Obnovte přehled.")
    before = {key: getattr(row, key) for key in DIET_KEYS}
    changed = db.execute(update(ReservationBreakfastDiet).where(
        ReservationBreakfastDiet.reservation_id == reservation_id,
        ReservationBreakfastDiet.version == version,
    ).values(**{kind: enabled}, version=version + 1, updated_by=request.state.actor_id, updated_at=utc_now()))
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Diety pobytu byly změněny. Obnovte přehled.")
    if metadata:
        for key, value in metadata.items():
            setattr(row, key, value)
    db.flush()
    # Exact source identity, never room/name matching. Includes historical and future rows.
    orders = [item for item in db.scalars(related_query.execution_options(populate_existing=True))
              if reservation_id in reservation_ids(item.source_key, item.service_date)]
    project_flags(db, orders)
    db.add(AuditTrail(request_id=getattr(request.state, "request_id", ""), actor=request.state.actor_id,
                      actor_id=request.state.actor_id, actor_role=request.state.actor_role, module="breakfast",
                      action="reservation_diet", resource=f"reservation/{reservation_id}/{kind}", status_code=200,
                      detail=audit_detail_json({"before": before, "kind": kind, "enabled": enabled, "version": version + 1})))
    db.commit()
