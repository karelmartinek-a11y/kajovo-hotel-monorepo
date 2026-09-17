from datetime import date

import pytest

from app.config import Settings
from app.services.housekeeping import BetterHotelHousekeepingClient, STATUS_NAMES


def _reservation(
    reservation_id: str,
    room_id: str,
    room_name: str,
    *,
    arrival: str,
    departure: str,
    checkedin: str | None = None,
    checkedout: str | None = None,
    label: str = "Host",
    persons: int = 1,
) -> dict:
    return {
        "id": reservation_id,
        "arrival": arrival,
        "departure": departure,
        "label": label,
        "persons": persons,
        "room": {"id": room_id, "name": room_name},
        "reservation_status": {"name": "Check-in" if checkedin else "Potvrzeno"},
        "reservation_action": [{"checkedin": checkedin, "checkedout": checkedout}],
    }


class FakeHousekeepingClient(BetterHotelHousekeepingClient):
    def __init__(self) -> None:
        super().__init__(Settings(_env_file=None))
        self.patch_body: dict | None = None
        self.current_status_key = "dirty"

    def list_current_rooms(self) -> list[dict]:
        return [
            {
                "room_id": "room-101",
                "room_name": "101 KOMFORT",
                "room_status_id": f"{self.current_status_key}-id",
                "room_status": {
                    "id": f"{self.current_status_key}-id",
                    "name": STATUS_NAMES[self.current_status_key],
                    "color": "#F57621",
                },
            },
            {
                "room_id": "room-102",
                "room_name": "102 KOMFORT",
                "room_status_id": "clean-id",
                "room_status": {"id": "clean-id", "name": STATUS_NAMES["clean"], "color": "#138B43"},
            },
            {
                "room_id": "room-103",
                "room_name": "103 KOMFORT",
                "room_status_id": "dirty-id",
                "room_status": {"id": "dirty-id", "name": STATUS_NAMES["dirty"], "color": "#F57621"},
            },
            {"room_id": "heading", "room_name": "PRVNÍ PATRO", "room_status_id": None, "room_status": None},
            {"room_id": "test", "room_name": 999.0, "room_status_id": "dirty-id", "room_status": None},
        ]

    def list_room_statuses(self) -> list[dict]:
        return [{"id": f"{key}-id", "name": name} for key, name in STATUS_NAMES.items()]

    def list_reservations(self, service_date: date, *, range_type: str, state: str) -> list[dict]:
        assert service_date == date(2026, 9, 17)
        departure_101 = _reservation(
            "dep-101", "room-101", "101 KOMFORT", arrival="2026-09-16", departure="2026-09-17",
            checkedin="2026-09-16T12:00:00+00:00", checkedout="2026-09-17T09:00:00+00:00",
            label="Novákovi", persons=2,
        )
        departure_102 = _reservation(
            "dep-102", "room-102", "102 KOMFORT", arrival="2026-09-16", departure="2026-09-17",
            checkedin="2026-09-16T12:00:00+00:00", label="Svoboda", persons=1,
        )
        arrival_102 = _reservation(
            "arr-102", "room-102", "102 KOMFORT", arrival="2026-09-17", departure="2026-09-18",
            label="Svoboda", persons=1,
        )
        stay_103 = _reservation(
            "stay-103", "room-103", "103 KOMFORT", arrival="2026-09-15", departure="2026-09-19",
            checkedin="2026-09-15T12:00:00+00:00", label="Dvořák", persons=3,
        )
        if range_type == "departure" and state == "confirmed":
            return [departure_101, departure_102]
        if range_type == "departure" and state == "checked_out":
            return [departure_101]
        if range_type == "arrival":
            return [arrival_102]
        if range_type == "intersect":
            return [stay_103]
        raise AssertionError((range_type, state))

    def _request_json(self, path: str, *, method: str = "GET", query=None, body=None) -> dict:
        assert path == "/room-current-status/room-101"
        assert method == "PATCH"
        self.patch_body = body
        self.current_status_key = str(body["room_status_id"]).removesuffix("-id")
        return {"data": [], "meta": {"action": "updated"}}


def test_housekeeping_overview_combines_schedule_and_current_cleaning_state() -> None:
    overview = FakeHousekeepingClient().build_overview(date(2026, 9, 17))

    assert overview["housekeeping_status_is_current"] is True
    assert [room["room_number"] for room in overview["rooms"]] == ["101", "102", "103"]
    by_number = {room["room_number"]: room for room in overview["rooms"]}
    assert by_number["101"]["operational_state"] == "checkout_departed_dirty"
    assert by_number["101"]["guest_label"] == "Novákovi"
    assert by_number["102"]["operational_state"] == "checkout_pending"
    assert by_number["102"]["arrival_today"] is True
    assert by_number["103"]["operational_state"] == "occupied"
    assert by_number["103"]["persons"] == 3


@pytest.mark.parametrize("status_key", list(STATUS_NAMES))
def test_housekeeping_status_update_uses_exact_catalogue_name_and_verifies_result(status_key: str) -> None:
    client = FakeHousekeepingClient()
    client.current_status_key = "clean" if status_key == "dirty" else "dirty"
    updated = client.update_room_status("room-101", status_key)

    assert client.patch_body == {"room_status_id": f"{status_key}-id", "return_detail": True}
    assert updated["room_status"]["name"] == STATUS_NAMES[status_key]


def test_housekeeping_status_update_skips_same_status_without_history_side_effect() -> None:
    client = FakeHousekeepingClient()

    updated = client.update_room_status("room-101", "dirty")

    assert client.patch_body is None
    assert updated["room_status"]["name"] == "Neuklizeno"
