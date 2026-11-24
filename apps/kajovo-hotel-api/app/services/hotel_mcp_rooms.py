"""Scoped housekeeping projections using the Hotel room and stay source."""

from datetime import date, datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.routes import housekeeping
from app.api.schemas import (
    HousekeepingBlockRead,
    HousekeepingOperationalState,
    HousekeepingRoomStatus,
    HousekeepingRoomStatusUpdate,
    HousekeepingStayRead,
    ReservationAmenityKind,
    ReservationAmenityState,
    ReservationAmenityUpdate,
    ReservationRequirementConfirm,
)


class Snapshot(BaseModel):
    day: date
    occupancy_date: date
    loaded_at: datetime
    housekeeping_status_is_current: bool


class RoomSummary(BaseModel):
    room_id: str
    room_number: str
    room_name: str
    floor: str
    housekeeping_status_key: HousekeepingRoomStatus | None
    ready_for_arrival: bool
    operational_state: HousekeepingOperationalState
    occupancy_state: Literal["departing", "arrived", "staying", "free"]
    occupied: bool
    current_persons: int
    arrival_count: int
    departure_count: int
    stay_count: int
    block_count: int


class RoomPage(Snapshot):
    items: list[RoomSummary]
    next_after_room_id: str | None = None


class RoomReservations(BaseModel):
    arrivals: list[HousekeepingStayRead]
    departures: list[HousekeepingStayRead]
    stays: list[HousekeepingStayRead]


class RoomDetail(Snapshot):
    room: RoomSummary
    blocks: list[HousekeepingBlockRead]
    reservations: RoomReservations | None = None


def _snapshot(overview: dict) -> dict:
    return {
        "day": overview["date"],
        "occupancy_date": overview["occupancy_date"],
        "loaded_at": overview["loaded_at"],
        "housekeeping_status_is_current": overview["housekeeping_status_is_current"],
    }


def _summary(row: dict) -> RoomSummary:
    return RoomSummary.model_validate(
        {
            **row,
            "arrival_count": len(row["arrivals"]),
            "departure_count": len(row["departures"]),
            "stay_count": len(row["stays"]),
            "block_count": len(row.get("blocks", [])),
        }
    )


def _overview(db: Session, day: date) -> dict:
    return housekeeping.get_housekeeping_rooms(
        day, include_options=True, include_blocks=True, db=db
    )


def list_rooms(
    db: Session,
    day: date,
    floor: str | None,
    room_number: str | None,
    after_room_id: str | None,
    limit: int,
) -> RoomPage:
    overview = _overview(db, day)
    rows = [
        room
        for room in overview["rooms"]
        if (floor is None or room["floor"] == floor)
        and (room_number is None or room["room_number"] == room_number)
    ]
    if after_room_id is not None:
        for index, row in enumerate(rows):
            if row["room_id"] == after_room_id:
                rows = rows[index + 1 :]
                break
        else:
            raise HTTPException(409, "Pokoj kurzoru zmizel. Načti první stránku.")
    return RoomPage(
        **_snapshot(overview),
        items=[_summary(row) for row in rows[:limit]],
        next_after_room_id=rows[limit - 1]["room_id"] if len(rows) > limit else None,
    )


def detail(db: Session, day: date, room_id: str, include_reservations: bool) -> RoomDetail:
    overview = _overview(db, day)
    row = next((room for room in overview["rooms"] if room["room_id"] == room_id), None)
    if row is None:
        raise HTTPException(404, "Pokoj nebyl nalezen.")
    return RoomDetail(
        **_snapshot(overview),
        room=_summary(row),
        blocks=row.get("blocks", []),
        reservations=RoomReservations.model_validate(row) if include_reservations else None,
    )


def set_status(db: Session, day: date, room_id: str, payload: HousekeepingRoomStatusUpdate) -> dict:
    updated = housekeeping.update_housekeeping_room_status(
        room_id, payload, day, include_options=True, include_blocks=True, db=db
    )
    if updated.get("housekeeping_status_key") != payload.status:
        raise HTTPException(502, "Změna stavu pokoje nebyla při novém čtení potvrzena.")
    return {}


def confirm_requirement(
    db: Session,
    request: Request,
    day: date,
    room_id: str,
    reservation_id: str,
    kind: ReservationAmenityKind,
    payload: ReservationRequirementConfirm,
) -> dict:
    housekeeping.confirm_reservation_requirement(
        reservation_id, kind, payload, request, room_id, day, db
    )
    return {}


def set_amenity(
    db: Session,
    request: Request,
    day: date,
    room_id: str,
    reservation_id: str,
    kind: ReservationAmenityKind,
    action: Literal["add", "set_state", "remove"],
    version: int,
    state: ReservationAmenityState | None,
) -> dict:
    if action == "set_state":
        if state is None or version < 1:
            raise HTTPException(400, "Při změně barvy zadej state a aktuální verzi.")
        payload = ReservationAmenityUpdate(state=state, version=version)
        housekeeping.update_reservation_amenity(
            reservation_id, kind, payload, request, room_id, day, db
        )
    elif state is not None:
        raise HTTPException(400, "Pole state použij jen při změně barvy.")
    elif action == "add":
        housekeeping.add_reservation_amenity(
            reservation_id, kind, request, room_id, day, version, db
        )
    else:
        if version < 1:
            raise HTTPException(400, "Při odebrání zadej aktuální verzi.")
        housekeeping.remove_reservation_amenity(
            reservation_id, kind, request, room_id, day, version, db
        )
    return {}
