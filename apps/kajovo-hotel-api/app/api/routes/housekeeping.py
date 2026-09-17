from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.schemas import (
    HousekeepingRoomRead,
    HousekeepingRoomsOverview,
    HousekeepingRoomStatusUpdate,
    ReservationAmenityKind,
    ReservationAmenityRead,
    ReservationAmenityUpdate,
)
from app.config import get_settings
from app.db.session import get_db
from app.security.rbac import module_access_dependency
from app.services.housekeeping import BetterHotelHousekeepingClient, BetterHotelHousekeepingError
from app.services.reservation_amenities import change_amenity, enrich_overview

router = APIRouter(
    prefix="/api/v1/housekeeping",
    tags=["housekeeping"],
    dependencies=[Depends(module_access_dependency("housekeeping"))],
)


def _client() -> BetterHotelHousekeepingClient:
    return BetterHotelHousekeepingClient(get_settings())


@router.get("/rooms", response_model=HousekeepingRoomsOverview)
def get_housekeeping_rooms(service_date: date = Query(alias="date"), db: Session = Depends(get_db)) -> dict:
    try:
        return enrich_overview(db, _client().build_overview(service_date))
    except BetterHotelHousekeepingError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.patch("/rooms/{room_id}", response_model=HousekeepingRoomRead)
def update_housekeeping_room_status(
    room_id: str,
    payload: HousekeepingRoomStatusUpdate,
    service_date: date = Query(alias="date"),
    db: Session = Depends(get_db),
) -> dict:
    client = _client()
    try:
        client.update_room_status(room_id, payload.status.value, note=payload.note)
        overview = enrich_overview(db, client.build_overview(service_date))
    except BetterHotelHousekeepingError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    updated = next((item for item in overview["rooms"] if item["room_id"] == room_id), None)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Aktualizovaný pokoj nebyl nalezen v přehledu.")
    return updated


def _verify_reservation(reservation_id: str, room_id: str, service_date: date) -> None:
    try:
        reservations = _client().reservations_for_day(service_date)
    except BetterHotelHousekeepingError as exc:
        raise HTTPException(502, str(exc)) from exc
    if not any(str(item.get("id")) == reservation_id and isinstance(item.get("room"), dict)
               and str(item["room"].get("id")) == room_id for item in reservations):
        raise HTTPException(409, "Pobyt již není přiřazen k tomuto pokoji a dni. Obnovte přehled.")


@router.post("/reservations/{reservation_id}/amenities/{kind}", response_model=ReservationAmenityRead)
def add_reservation_amenity(reservation_id: str, kind: ReservationAmenityKind, request: Request,
                            room_id: str, service_date: date = Query(alias="date"),
                            version: int = Query(default=0, ge=0), db: Session = Depends(get_db)) -> dict:
    if request.state.actor_role not in {"admin", "recepce"}:
        raise HTTPException(403, "Ikony může přidávat jen recepce nebo administrátor.")
    _verify_reservation(reservation_id, room_id, service_date)
    return change_amenity(db, request, reservation_id, kind.value, operation="add", version=version)


@router.patch("/reservations/{reservation_id}/amenities/{kind}", response_model=ReservationAmenityRead)
def update_reservation_amenity(reservation_id: str, kind: ReservationAmenityKind, payload: ReservationAmenityUpdate,
                               request: Request, room_id: str, service_date: date = Query(alias="date"),
                               db: Session = Depends(get_db)) -> dict:
    _verify_reservation(reservation_id, room_id, service_date)
    return change_amenity(db, request, reservation_id, kind.value, operation="color", version=payload.version, state=payload.state.value)


@router.delete("/reservations/{reservation_id}/amenities/{kind}", response_model=ReservationAmenityRead)
def remove_reservation_amenity(reservation_id: str, kind: ReservationAmenityKind, request: Request,
                               room_id: str, service_date: date = Query(alias="date"),
                               version: int = Query(ge=1), db: Session = Depends(get_db)) -> dict:
    if request.state.actor_role not in {"admin", "recepce"}:
        raise HTTPException(403, "Ikony může odebírat jen recepce nebo administrátor.")
    _verify_reservation(reservation_id, room_id, service_date)
    return change_amenity(db, request, reservation_id, kind.value, operation="remove", version=version)
