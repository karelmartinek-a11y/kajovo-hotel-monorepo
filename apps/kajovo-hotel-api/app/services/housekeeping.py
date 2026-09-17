from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from typing import Any

from app.config import Settings

ROOM_NUMBERS = frozenset(
    {
        "101", "102", "103", "104", "105", "106", "107", "108", "109",
        "201", "202", "203", "204", "205", "206", "207", "208", "209", "210",
        "221", "222", "223", "224",
        "301", "302", "303", "304", "305", "306", "307", "308", "309", "310",
        "321", "322", "323", "324",
    }
)

STATUS_NAMES = {
    "clean": "Uklizeno pro nájezd",
    "dirty": "Neuklizeno",
    "stay_no_linen": "Pobyt-bez ložního prádla",
    "stay_with_linen": "Uklizeno - s ložním prádlem",
    "do_not_disturb": "Nerušenka",
    "technical_issue": "Technický problém",
}


class BetterHotelHousekeepingError(RuntimeError):
    pass


def _require_dict(value: Any, *, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BetterHotelHousekeepingError(f"Better Hotel odpověď má neplatnou strukturu: {label} není objekt.")
    return value


def _require_list(value: Any, *, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise BetterHotelHousekeepingError(f"Better Hotel odpověď má neplatnou strukturu: {label} není pole.")
    return value


def _room_number(value: Any) -> str | None:
    match = re.match(r"^\s*(\d{3})(?:\.0)?(?:\s|$)", str(value or ""))
    if not match:
        return None
    number = match.group(1)
    return number if number in ROOM_NUMBERS else None


def _floor_for_room(room_number: str) -> str:
    if room_number.startswith("3"):
        return "3"
    if room_number.startswith("2"):
        return "2"
    if room_number.startswith("1"):
        return "1"
    return "0"


def _reservation_action(reservation: dict[str, Any]) -> dict[str, Any]:
    actions = reservation.get("reservation_action")
    if not isinstance(actions, list):
        return {}
    for action in actions:
        if isinstance(action, dict):
            return action
    return {}


def _reservation_room(reservation: dict[str, Any]) -> tuple[str, str] | None:
    room = reservation.get("room")
    if not isinstance(room, dict):
        return None
    room_id = str(room.get("id") or "").strip()
    room_number = _room_number(room.get("name"))
    if not room_id or not room_number:
        return None
    return room_id, room_number


def _is_option(reservation: dict[str, Any]) -> bool:
    status = reservation.get("reservation_status")
    return isinstance(status, dict) and str(status.get("name") or "").strip().casefold() == "opce"


class BetterHotelHousekeepingClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_url = settings.better_hotel_connector_base_url.rstrip("/")
        self.timeout_seconds = max(5, int(settings.better_hotel_request_timeout_seconds))

    def is_configured(self) -> bool:
        return bool(self.settings.better_hotel_access_token.strip() and self.settings.better_hotel_client_token.strip())

    def _request_json(
        self,
        path: str,
        *,
        method: str = "GET",
        query: dict[str, str | list[str] | None] | None = None,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.is_configured():
            raise BetterHotelHousekeepingError(
                "Chybí Better Hotel tokeny. Nastavte BETTER_HOTEL_ACCESS_TOKEN a BETTER_HOTEL_CLIENT_TOKEN."
            )
        query_items: list[tuple[str, str]] = []
        for key, value in (query or {}).items():
            if value is None:
                continue
            if isinstance(value, list):
                query_items.extend((key, item) for item in value)
            else:
                query_items.append((key, value))
        encoded_query = urllib.parse.urlencode(query_items)
        url = f"{self.base_url}{path}"
        if encoded_query:
            url = f"{url}?{encoded_query}"
        headers = {
            "Accept": "application/json",
            "X-Access-Token": self.settings.better_hotel_access_token,
            "X-Client-Token": self.settings.better_hotel_client_token,
            "User-Agent": "kajovo-hotel-housekeeping/1.0",
        }
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                raise BetterHotelHousekeepingError("Better Hotel autentizace selhala.") from exc
            if exc.code == 403:
                raise BetterHotelHousekeepingError("Better Hotel účet nemá oprávnění general/rooms edit.") from exc
            if exc.code == 429:
                raise BetterHotelHousekeepingError("Better Hotel API vrátilo rate-limit.") from exc
            raise BetterHotelHousekeepingError(f"Better Hotel API vrátilo HTTP {exc.code}.") from exc
        except urllib.error.URLError as exc:
            raise BetterHotelHousekeepingError(f"Better Hotel API není dostupné: {exc.reason}") from exc
        except json.JSONDecodeError as exc:
            raise BetterHotelHousekeepingError("Better Hotel API vrátilo neplatný JSON.") from exc
        return _require_dict(payload, label="root")

    def _list_pages(self, path: str, query: dict[str, str | list[str] | None]) -> list[dict[str, Any]]:
        cursor: str | None = None
        seen_cursors: set[str] = set()
        result: list[dict[str, Any]] = []
        while True:
            payload = self._request_json(path, query={**query, "count": "25", "cursor": cursor})
            problems = _require_dict(payload.get("meta") or {}, label="meta").get("problems")
            if problems:
                raise BetterHotelHousekeepingError("Better Hotel API vrátilo problém při stránkování.")
            result.extend(_require_dict(item, label="data[]") for item in _require_list(payload.get("data"), label="data"))
            meta = _require_dict(payload.get("meta") or {}, label="meta")
            if not bool(meta.get("has_more")):
                return result
            next_cursor = meta.get("cursor")
            if not isinstance(next_cursor, str) or not next_cursor.strip() or next_cursor in seen_cursors:
                raise BetterHotelHousekeepingError("Better Hotel stránkování vrátilo neplatný nebo opakovaný cursor.")
            seen_cursors.add(next_cursor)
            cursor = next_cursor

    def list_current_rooms(self) -> list[dict[str, Any]]:
        return self._list_pages("/room-current-status", {"expand[]": ["room_status"]})

    def list_room_statuses(self) -> list[dict[str, Any]]:
        return self._list_pages("/room-status", {})

    def list_reservations(self, service_date: date, *, range_type: str, state: str) -> list[dict[str, Any]]:
        reservations = self._list_pages(
            "/reservation",
            {
                "filter[from]": service_date.isoformat(),
                "filter[to]": service_date.isoformat(),
                "filter[range_type]": range_type,
                "filter[mode]": "hotel",
                "filter[state]": state,
                "expand[]": ["room", "room_type", "reservation_status", "reservation_action"],
            },
        )
        deduplicated: dict[str, dict[str, Any]] = {}
        for reservation in reservations:
            reservation_id = str(reservation.get("id") or "").strip()
            if reservation_id:
                deduplicated[reservation_id] = reservation
        return list(deduplicated.values())

    def update_room_status(self, room_id: str, status_key: str, *, note: str | None = None) -> dict[str, Any]:
        expected_name = STATUS_NAMES.get(status_key)
        if not expected_name:
            raise BetterHotelHousekeepingError("Neznámý cílový stav pokoje.")
        matches = [item for item in self.list_room_statuses() if str(item.get("name") or "").strip() == expected_name]
        if len(matches) != 1:
            raise BetterHotelHousekeepingError(f"Stav {expected_name!r} není v Better Hotel číselníku jednoznačný.")
        status_id = str(matches[0].get("id") or "").strip()
        if not status_id:
            raise BetterHotelHousekeepingError(f"Stav {expected_name!r} nemá platné ID.")
        rooms_before_update = self.list_current_rooms()
        room_matches = [item for item in rooms_before_update if str(item.get("room_id") or "").strip() == room_id]
        if len(room_matches) != 1:
            raise BetterHotelHousekeepingError("Pokoj nelze před zápisem jednoznačně ověřit.")
        current_status = room_matches[0].get("room_status")
        current_status_id = str(room_matches[0].get("room_status_id") or "").strip()
        if isinstance(current_status, dict):
            current_status_id = str(current_status.get("id") or current_status_id).strip()
        if current_status_id == status_id:
            return room_matches[0]
        payload = self._request_json(
            f"/room-current-status/{urllib.parse.quote(room_id, safe='')}",
            method="PATCH",
            body={"room_status_id": status_id, "return_detail": True, **({"note": note} if note else {})},
        )
        meta = _require_dict(payload.get("meta") or {}, label="meta")
        if meta.get("action") not in {None, "updated"}:
            raise BetterHotelHousekeepingError("Better Hotel nepotvrdil aktualizaci pokoje.")
        rooms_after_update = self.list_current_rooms()
        room_matches = [item for item in rooms_after_update if str(item.get("room_id") or "").strip() == room_id]
        if len(room_matches) != 1:
            raise BetterHotelHousekeepingError("Aktualizovaný pokoj nelze po zápisu jednoznačně ověřit.")
        current_status = room_matches[0].get("room_status")
        current_status_id = str(room_matches[0].get("room_status_id") or "").strip()
        if isinstance(current_status, dict):
            current_status_id = str(current_status.get("id") or current_status_id).strip()
        if current_status_id != status_id:
            raise BetterHotelHousekeepingError("Ověření změny stavu pokoje v Better Hotel selhalo.")
        return room_matches[0]

    def build_overview(self, service_date: date) -> dict[str, Any]:
        current_rooms = self.list_current_rooms()
        departures = self.list_reservations(service_date, range_type="departure", state="confirmed")
        checked_out = self.list_reservations(service_date, range_type="departure", state="checked_out")
        arrivals = self.list_reservations(service_date, range_type="arrival", state="confirmed")
        stays = self.list_reservations(service_date, range_type="intersect", state="all")

        departure_by_room: dict[str, dict[str, Any]] = {}
        arrival_by_room: dict[str, dict[str, Any]] = {}
        stay_by_room: dict[str, dict[str, Any]] = {}
        checked_out_rooms: set[str] = set()
        for reservation in departures:
            room = _reservation_room(reservation)
            if room and reservation.get("departure") == service_date.isoformat() and not _is_option(reservation):
                departure_by_room[room[0]] = reservation
                if _reservation_action(reservation).get("checkedout"):
                    checked_out_rooms.add(room[0])
        for reservation in checked_out:
            room = _reservation_room(reservation)
            if room and reservation.get("departure") == service_date.isoformat() and _reservation_action(reservation).get("checkedout"):
                checked_out_rooms.add(room[0])
                departure_by_room.setdefault(room[0], reservation)
        for reservation in arrivals:
            room = _reservation_room(reservation)
            if room and reservation.get("arrival") == service_date.isoformat() and not _is_option(reservation):
                arrival_by_room[room[0]] = reservation
        for reservation in stays:
            room = _reservation_room(reservation)
            if room and not _is_option(reservation):
                stay_by_room[room[0]] = reservation

        output_rooms: list[dict[str, Any]] = []
        for raw_room in current_rooms:
            room_id = str(raw_room.get("room_id") or "").strip()
            room_number = _room_number(raw_room.get("room_name"))
            if not room_id or not room_number:
                continue
            status = raw_room.get("room_status") if isinstance(raw_room.get("room_status"), dict) else None
            status_name = str(status.get("name") or "").strip() if status else None
            status_id = str(status.get("id") or raw_room.get("room_status_id") or "").strip() or None if status else str(raw_room.get("room_status_id") or "").strip() or None
            status_color = str(status.get("color") or "").strip() or None if status else None
            is_clean = status_name in {STATUS_NAMES["clean"], STATUS_NAMES["stay_with_linen"]}
            departure = departure_by_room.get(room_id)
            arrival = arrival_by_room.get(room_id)
            stay = stay_by_room.get(room_id)
            is_checked_out = room_id in checked_out_rooms
            if departure and is_checked_out:
                operational_state = "checkout_departed_clean" if is_clean else "checkout_departed_dirty"
            elif departure:
                operational_state = "checkout_pending"
            elif stay and not _reservation_action(stay).get("checkedout"):
                operational_state = "occupied"
            else:
                operational_state = "free"
            reservation = departure or arrival or stay
            output_rooms.append(
                {
                    "room_id": room_id,
                    "room_number": room_number,
                    "room_name": str(raw_room.get("room_name") or room_number),
                    "floor": _floor_for_room(room_number),
                    "housekeeping_status_id": status_id,
                    "housekeeping_status": status_name,
                    "housekeeping_color": status_color,
                    "operational_state": operational_state,
                    "arrival_today": arrival is not None,
                    "departure_today": departure is not None,
                    "checked_out": is_checked_out,
                    "occupied": operational_state == "occupied",
                    "guest_label": str(reservation.get("label") or "").strip() or None if reservation else None,
                    "persons": int(reservation.get("persons") or 0) if reservation else 0,
                }
            )
        output_rooms.sort(key=lambda room: int(room["room_number"]))
        return {
            "date": service_date,
            "housekeeping_status_is_current": True,
            "loaded_at": datetime.now(timezone.utc),
            "rooms": output_rooms,
        }
