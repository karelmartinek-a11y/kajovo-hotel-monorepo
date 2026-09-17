from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit_utils import audit_detail_json
from app.db.models import AuditTrail, ReservationAmenity


def amenity_read(row: ReservationAmenity) -> dict:
    return {"kind": row.kind, "state": row.state, "version": row.version, "active": row.active}


def enrich_overview(db: Session, overview: dict) -> dict:
    stays = [stay for room in overview["rooms"] for group in ("departures", "arrivals", "stays") for stay in room[group]]
    ids = {stay["reservation_id"] for stay in stays}
    by_reservation: dict[str, list[dict]] = {}
    if ids:
        for row in db.scalars(select(ReservationAmenity).where(ReservationAmenity.reservation_id.in_(ids))):
            by_reservation.setdefault(row.reservation_id, []).append(amenity_read(row))
    for stay in stays:
        stay["amenities"] = by_reservation.get(stay["reservation_id"], [])
    return overview


def change_amenity(db: Session, request: Request, reservation_id: str, kind: str, *, operation: str, version: int, state: str = "red") -> dict:
    role = request.state.actor_role
    if operation != "color" and role not in {"admin", "recepce"}:
        raise HTTPException(403, "Ikony může přidávat a odebírat jen recepce nebo administrátor.")
    row = db.scalar(select(ReservationAmenity).where(ReservationAmenity.reservation_id == reservation_id, ReservationAmenity.kind == kind))
    before = amenity_read(row) if row else None
    if (row.version if row else 0) != version or (operation == "add" and row and row.active) or (operation != "add" and (row is None or not row.active)):
        raise HTTPException(409, "Ikonu mezitím změnil jiný uživatel. Načtěte aktuální přehled.")
    values = {"state": "red" if operation == "add" else state if operation == "color" else row.state,
              "active": operation != "remove", "version": version + 1,
              "updated_by": request.state.actor_id, "updated_at": datetime.now(timezone.utc)}
    try:
        if row is None:
            row = ReservationAmenity(reservation_id=reservation_id, kind=kind, **values)
            db.add(row)
            db.flush()
        else:
            changed = db.execute(update(ReservationAmenity).where(ReservationAmenity.id == row.id, ReservationAmenity.version == version).values(**values))
            if changed.rowcount != 1:
                db.rollback()
                raise HTTPException(409, "Ikonu mezitím změnil jiný uživatel.")
            db.refresh(row)
        after = amenity_read(row)
        db.add(AuditTrail(request_id=getattr(request.state, "request_id", ""), actor=request.state.actor_id,
                          actor_id=request.state.actor_id, actor_role=role, module="housekeeping", action=operation,
                          resource=f"reservation/{reservation_id}/{kind}", status_code=200,
                          detail=audit_detail_json({"before": before, "after": after})))
        db.commit()
        return after
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Ikonu mezitím změnil jiný uživatel.") from exc
