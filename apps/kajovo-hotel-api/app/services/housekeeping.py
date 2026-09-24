from __future__ import annotations

import gettext
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import pycountry

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

COUNTRY_TRANSLATION = gettext.translation("iso3166-1", pycountry.LOCALES_DIR, languages=["cs"], fallback=True)


def current_hotel_date() -> date:
    return datetime.now(ZoneInfo("Europe/Prague")).date()


def _stay_read(reservation: dict[str, Any]) -> dict[str, Any]:
    main = reservation.get("main_guest")
    guest = main if isinstance(main, dict) else next(
        (item["guest"] for item in (reservation.get("guest_list") or [])
         if isinstance(item, dict) and isinstance(item.get("guest"), dict) and item["guest"].get("id") == main),
        {},
    )
    address = guest.get("address")
    code = str(address.get("country") or "").upper() if isinstance(address, dict) else ""
    country = pycountry.countries.get(**({"alpha_3": code} if len(code) == 3 else {"alpha_2": code})) if code else None
    action = _reservation_action(reservation)
    return {
        "reservation_id": str(reservation["id"]),
        "guest_label": str(reservation.get("label") or guest.get("full_name") or "").strip() or None,
        "persons": max(0, int(reservation.get("persons") or 0)),
        "country_name": COUNTRY_TRANSLATION.gettext(country.name) if country else None,
        "country_code": country.alpha_2 if country else None,
        "arrival": reservation["arrival"], "departure": reservation["departure"],
        "checked_in": action.get("checkedin"), "checked_out": action.get("checkedout"),
        "amenities": [],
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
                "expand[]": ["room", "reservation_status", "reservation_action", "guest_list", "guest_list.guest", "guest_list.guest.address"],
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

    def reservations_for_day(self, day: date) -> list[dict[str, Any]]:
        records: dict[str, dict[str, Any]] = {}
        for range_type, state in [("intersect", "confirmed"), ("intersect", "checked_out"), ("departure", "confirmed"), ("departure", "checked_out"), ("arrival", "confirmed"), ("arrival", "checked_out")]:
            for item in self.list_reservations(day, range_type=range_type, state=state):
                if _is_option(item) or not item.get("id"):
                    continue
                if str(item.get("arrival", "")) <= day.isoformat() <= str(item.get("departure", "")):
                    records[str(item["id"])] = item
        return sorted(records.values(), key=lambda item: (str(item.get("arrival")), str(item["id"])))

    def build_overview(self, service_date: date) -> dict[str, Any]:
        today = current_hotel_date()
        current_rooms = self.list_current_rooms()
        selected = self.reservations_for_day(service_date)
        current = selected if service_date == today else self.reservations_for_day(today)
        output_rooms: list[dict[str, Any]] = []
        for raw_room in current_rooms:
            room_id = str(raw_room.get("room_id") or "").strip()
            room_number = _room_number(raw_room.get("room_name"))
            if not room_id or not room_number:
                continue
            status = raw_room.get("room_status") if isinstance(raw_room.get("room_status"), dict) else None
            status_name = str(status.get("name") or "").strip() if status else None
            status_key = next((key for key, name in STATUS_NAMES.items() if name == status_name), None)
            status_id = str(status.get("id") or raw_room.get("room_status_id") or "").strip() or None if status else str(raw_room.get("room_status_id") or "").strip() or None
            status_color = str(status.get("color") or "").strip() or None if status else None
            is_clean = status_name in {STATUS_NAMES[key] for key in ("clean", "stay_no_linen", "stay_with_linen")}
            def in_room(item: dict[str, Any]) -> bool:
                room = _reservation_room(item)
                return room is not None and room[0] == room_id

            displayed = [item for item in selected if in_room(item)]
            live = [item for item in current if in_room(item)]
            departures = [item for item in displayed if item["departure"] == service_date.isoformat()]
            arrivals = [item for item in displayed if item["arrival"] == service_date.isoformat()]
            stays = [item for item in displayed if item["arrival"] < service_date.isoformat() < item["departure"]]
            live_departures = [item for item in live if item["departure"] == today.isoformat()]
            active = [item for item in live if _reservation_action(item).get("checkedin") and not _reservation_action(item).get("checkedout")]
            arrived = any(item["arrival"] == today.isoformat() for item in active)
            departing = any(not _reservation_action(item).get("checkedout") for item in live_departures)
            is_checked_out = any(_reservation_action(item).get("checkedout") for item in live_departures)
            if arrived:
                operational_state, occupancy_state = "arrived", "arrived"
            elif departing:
                operational_state = "checkout_pending_clean" if is_clean else "checkout_pending"
                occupancy_state = "departing"
            elif active:
                operational_state, occupancy_state = "occupied", "staying"
            elif is_checked_out:
                operational_state = "checkout_departed_clean" if is_clean else "checkout_departed_dirty"
                occupancy_state = "free"
            else:
                operational_state, occupancy_state = "free", "free"
            reservation = next(iter(departures or arrivals or stays), None)
            output_rooms.append(
                {
                    "room_id": room_id,
                    "room_number": room_number,
                    "room_name": str(raw_room.get("room_name") or room_number),
                    "floor": _floor_for_room(room_number),
                    "housekeeping_status_id": status_id,
                    "housekeeping_status": status_name,
                    "housekeeping_status_key": status_key,
                    "ready_for_arrival": status_name == STATUS_NAMES["clean"],
                    "housekeeping_color": status_color,
                    "operational_state": operational_state,
                    "occupancy_state": occupancy_state,
                    "departures": [_stay_read(item) for item in departures],
                    "arrivals": [_stay_read(item) for item in arrivals],
                    "stays": [_stay_read(item) for item in stays],
                    "arrival_today": bool(arrivals),
                    "departure_today": bool(departures),
                    "checked_out": is_checked_out,
                    "occupied": occupancy_state != "free",
                    "guest_label": str(reservation.get("label") or "").strip() or None if reservation else None,
                    "persons": int(reservation.get("persons") or 0) if reservation else 0,
                }
            )
        output_rooms.sort(key=lambda room: int(room["room_number"]))
        return {
            "date": service_date,
            "housekeeping_status_is_current": True,
            "occupancy_date": today,
            "loaded_at": datetime.now(timezone.utc),
            "rooms": output_rooms,
        }
