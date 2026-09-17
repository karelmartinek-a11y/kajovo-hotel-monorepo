from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.schemas import (
    HousekeepingRoomRead,
    HousekeepingRoomsOverview,
    HousekeepingRoomStatusUpdate,
)
from app.config import get_settings
from app.security.rbac import module_access_dependency
from app.services.housekeeping import BetterHotelHousekeepingClient, BetterHotelHousekeepingError

router = APIRouter(
    prefix="/api/v1/housekeeping",
    tags=["housekeeping"],
    dependencies=[Depends(module_access_dependency("housekeeping"))],
)


def _client() -> BetterHotelHousekeepingClient:
    return BetterHotelHousekeepingClient(get_settings())


@router.get("/rooms", response_model=HousekeepingRoomsOverview)
def get_housekeeping_rooms(service_date: date = Query(alias="date")) -> dict:
    try:
        return _client().build_overview(service_date)
    except BetterHotelHousekeepingError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.patch("/rooms/{room_id}", response_model=HousekeepingRoomRead)
def update_housekeeping_room_status(
    room_id: str,
    payload: HousekeepingRoomStatusUpdate,
    service_date: date = Query(alias="date"),
) -> dict:
    client = _client()
    try:
        client.update_room_status(room_id, payload.status.value, note=payload.note)
        overview = client.build_overview(service_date)
    except BetterHotelHousekeepingError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    updated = next((item for item in overview["rooms"] if item["room_id"] == room_id), None)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Aktualizovaný pokoj nebyl nalezen v přehledu.")
    return updated
