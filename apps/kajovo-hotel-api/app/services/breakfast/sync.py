from __future__ import annotations

import hashlib
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pycountry
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.models import (
    BreakfastImportProcessedAttachment,
    BreakfastImportRunLog,
    BreakfastOrder,
    BreakfastStatus,
)
from app.services.better_hotel_notes import housekeep_note
from app.services.breakfast.diets import ensure_diets, project_flags
from app.time_utils import utc_now

log = logging.getLogger("kajovo.breakfast.sync")

PRAGUE_TZ = ZoneInfo("Europe/Prague")
DEFAULT_BREAKFAST_FOOD_CODES = frozenset({1, 2, 3})


class BetterHotelSyncError(RuntimeError):
    pass


@dataclass(frozen=True)
class BetterHotelBreakfastAggregate:
    service_date: date
    source_key: str
    room_number: str
    guest_count: int
    guest_name: str | None
    reservations: dict[str, dict] = field(default_factory=dict)
    guest_names: str | None = None
    country_code: str | None = None
    housekeeping_note: str | None = None


@dataclass(frozen=True)
class BetterHotelSyncResult:
    ok: bool
    trigger: str
    range_start: date
    range_end: date
    processed_days: int
    imported_days: int
    imported_rows: int
    replaced_future_count: int
    reservations_count: int
    errors: list[str]
    source_imported_at: datetime


def prague_today() -> date:
    return utc_now().astimezone(PRAGUE_TZ).date()


def default_sync_range(*, today: date | None = None, settings: Settings | None = None) -> tuple[date, date]:
    current_day = today or prague_today()
    active_settings = settings or get_settings()
    forward_days = max(0, int(active_settings.better_hotel_breakfast_window_days_forward))
    return current_day, current_day + timedelta(days=forward_days)


def parse_breakfast_food_codes(raw: str) -> set[int]:
    codes: set[int] = set()
    for item in re.split(r"[,\s;]+", raw or ""):
        normalized = item.strip()
        if not normalized:
            continue
        try:
            codes.add(int(normalized))
        except ValueError as exc:
            raise BetterHotelSyncError(f"Neplatná konfigurace breakfast food codes: {normalized}") from exc
    effective_codes = codes | set(DEFAULT_BREAKFAST_FOOD_CODES)
    if not effective_codes:
        raise BetterHotelSyncError("Chybí konfigurace Better Hotel breakfast food codes.")
    return effective_codes


def _require_dict(value: Any, *, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BetterHotelSyncError(f"Better Hotel odpověď má neplatnou strukturu: {label} není objekt.")
    return value


def _require_list(value: Any, *, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise BetterHotelSyncError(f"Better Hotel odpověď má neplatnou strukturu: {label} není pole.")
    return value


def _parse_iso_date(value: Any, *, label: str) -> date:
    if not isinstance(value, str) or not value.strip():
        raise BetterHotelSyncError(f"Better Hotel odpověď má neplatné datum: {label}.")
    try:
        return date.fromisoformat(value[:10])
    except ValueError as exc:
        raise BetterHotelSyncError(f"Better Hotel odpověď má neplatné datum: {label}={value!r}.") from exc


def _extract_room_number(raw_room: str, *, reservation_id: str) -> str:
    normalized = re.sub(r"\s+", " ", (raw_room or "").strip())
    if not normalized:
        raise BetterHotelSyncError(f"Rezervace {reservation_id} nemá vyplněný pokoj.")
    match = re.search(r"\d{1,4}", normalized)
    if match:
        return match.group(0)
    return normalized[:32]


def _extract_guest_name(item: dict[str, Any]) -> str:
    guest = item.get("guest")
    if isinstance(guest, dict):
        first_name = str(guest.get("first_name") or "").strip()
        last_name = str(guest.get("last_name") or "").strip()
        full_name = " ".join(part for part in (first_name, last_name) if part).strip()
        if full_name:
            return full_name
        label = str(guest.get("label") or "").strip()
        if label:
            return label
    label = str(item.get("label") or "").strip()
    return label


def _country_code(reservation: dict[str, Any]) -> str | None:
    main = reservation.get("main_guest")
    guest = main if isinstance(main, dict) else next(
        (item["guest"] for item in (reservation.get("guest_list") or [])
         if isinstance(item, dict) and isinstance(item.get("guest"), dict) and str(item["guest"].get("id")) == str(main)),
        None,
    )
    address = guest.get("address") if isinstance(guest, dict) else None
    code = str(address.get("country") or "").upper() if isinstance(address, dict) else ""
    country = pycountry.countries.get(**({"alpha_3": code} if len(code) == 3 else {"alpha_2": code})) if len(code) in {2, 3} else None
    return country.alpha_2 if country else None


def build_breakfast_source_key(*, service_date: date, reservation_ids: set[str]) -> str:
    normalized_ids = sorted({reservation_id.strip() for reservation_id in reservation_ids if reservation_id.strip()})
    if not normalized_ids:
        raise BetterHotelSyncError("Chybí stabilní identita rezervace pro synchronizaci snídaně.")
    return f"{service_date.isoformat()}|{'|'.join(normalized_ids)}"


class BetterHotelBreakfastClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_url = settings.better_hotel_connector_base_url.rstrip("/")
        self.timeout_seconds = max(5, int(settings.better_hotel_request_timeout_seconds))
        self.breakfast_food_codes = parse_breakfast_food_codes(settings.better_hotel_breakfast_food_codes)

    def is_configured(self) -> bool:
        return bool(self.settings.better_hotel_access_token.strip() and self.settings.better_hotel_client_token.strip())

    def _request_json(self, path: str, query: dict[str, str | list[str] | None]) -> dict[str, Any]:
        if not self.is_configured():
            raise BetterHotelSyncError(
                "Chybí Better Hotel tokeny. Nastavte BETTER_HOTEL_ACCESS_TOKEN a BETTER_HOTEL_CLIENT_TOKEN."
            )

        query_items: list[tuple[str, str]] = []
        for key, value in query.items():
            if value is None:
                continue
            if isinstance(value, list):
                for item in value:
                    query_items.append((key, item))
            else:
                query_items.append((key, value))
        encoded_query = urllib.parse.urlencode(query_items)
        url = f"{self.base_url}{path}"
        if encoded_query:
            url = f"{url}?{encoded_query}"

        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/json",
                "X-Access-Token": self.settings.better_hotel_access_token,
                "X-Client-Token": self.settings.better_hotel_client_token,
                "User-Agent": "kajovo-hotel-breakfast-sync/1.0",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if exc.code == 401:
                raise BetterHotelSyncError("Better Hotel autentizace selhala.") from exc
            if exc.code == 429:
                raise BetterHotelSyncError("Better Hotel API vrátilo rate-limit.") from exc
            raise BetterHotelSyncError(
                f"Better Hotel API vrátilo HTTP {exc.code}: {body[:300]}"
            ) from exc
        except urllib.error.URLError as exc:
            raise BetterHotelSyncError(f"Better Hotel API není dostupné: {exc.reason}") from exc
        except json.JSONDecodeError as exc:
            raise BetterHotelSyncError("Better Hotel API vrátilo neplatný JSON.") from exc

        return _require_dict(payload, label="root")

    def list_breakfast_reservations(
        self,
        *,
        service_start: date,
        service_end: date,
    ) -> list[dict[str, Any]]:
        query_from = service_start - timedelta(days=1)
        cursor: str | None = None
        reservations: list[dict[str, Any]] = []

        while True:
            payload = self._request_json(
                "/reservation",
                {
                    "count": "25",
                    "cursor": cursor,
                    "filter[state]": "all",
                    "filter[from]": query_from.isoformat(),
                    "filter[to]": service_end.isoformat(),
                    "filter[range_type]": "intersect",
                    "expand[]": ["guest_list", "guest_list.guest", "guest_list.guest.address", "room", "reservation_note"],
                },
            )
            data = _require_list(payload.get("data"), label="data")
            meta = _require_dict(payload.get("meta") or {}, label="meta")

            for item in data:
                reservations.append(_require_dict(item, label="reservation"))

            has_more = bool(meta.get("has_more"))
            next_cursor = meta.get("cursor")
            if not has_more:
                return reservations
            if not isinstance(next_cursor, str) or not next_cursor.strip():
                raise BetterHotelSyncError("Better Hotel stránkování vrátilo has_more bez cursoru.")
            cursor = next_cursor

    def build_aggregates(
        self,
        *,
        service_start: date,
        service_end: date,
    ) -> tuple[list[BetterHotelBreakfastAggregate], int, str]:
        reservations = self.list_breakfast_reservations(service_start=service_start, service_end=service_end)
        grouped: dict[tuple[date, str], dict[str, Any]] = {}

        for reservation in reservations:
            reservation_id = str(reservation.get("id") or reservation.get("uuid") or "").strip() or "unknown"
            if reservation_id == "unknown" or "|" in reservation_id or len(reservation_id) > 128:
                raise BetterHotelSyncError("Rezervace nemá platnou stabilní identitu.")
            arrival = _parse_iso_date(reservation.get("arrival"), label=f"reservation[{reservation_id}].arrival")
            departure = _parse_iso_date(
                reservation.get("departure"),
                label=f"reservation[{reservation_id}].departure",
            )
            if departure <= arrival:
                raise BetterHotelSyncError(
                    f"Rezervace {reservation_id} má neplatné období {arrival.isoformat()}-{departure.isoformat()}."
                )

            room_payload = _require_dict(reservation.get("room") or {}, label=f"reservation[{reservation_id}].room")
            room_number = _extract_room_number(str(room_payload.get("name") or ""), reservation_id=reservation_id)

            guest_list = _require_list(
                reservation.get("guest_list") or [],
                label=f"reservation[{reservation_id}].guest_list",
            )
            breakfast_guest_names: list[str] = []
            all_guest_names = [name for item in guest_list if isinstance(item, dict) if (name := _extract_guest_name(item))]
            country_code = _country_code(reservation)
            for guest_item_raw in guest_list:
                guest_item = _require_dict(guest_item_raw, label=f"reservation[{reservation_id}].guest_list[]")
                try:
                    food_code = int(guest_item.get("food"))
                except (TypeError, ValueError) as exc:
                    raise BetterHotelSyncError(
                        f"Rezervace {reservation_id} má neplatný food kód v guest_list."
                    ) from exc
                if food_code not in self.breakfast_food_codes:
                    continue
                guest_name = _extract_guest_name(guest_item)
                if guest_name:
                    breakfast_guest_names.append(guest_name)

            breakfast_guest_count = len(
                [
                    guest_item
                    for guest_item in guest_list
                    if isinstance(guest_item, dict)
                    and str(guest_item.get("food", "")).strip().isdigit()
                    and int(guest_item.get("food")) in self.breakfast_food_codes
                ]
            )
            if breakfast_guest_count <= 0:
                continue

            current_day = max(service_start, arrival + timedelta(days=1))
            last_day = min(service_end, departure)
            while current_day <= last_day:
                key = (current_day, room_number)
                current = grouped.setdefault(
                    key,
                    {"count": 0, "names": [], "all_names": [], "country_codes": [], "housekeeping_notes": [], "reservation_ids": set(), "reservations": {}},
                )
                current["count"] += breakfast_guest_count
                current["names"].extend(breakfast_guest_names)
                current["all_names"].extend(all_guest_names)
                if country_code:
                    current["country_codes"].append(country_code)
                if note := housekeep_note(reservation):
                    current["housekeeping_notes"].append(note)
                current["reservation_ids"].add(reservation_id)
                current["reservations"][reservation_id] = {
                    "arrival": arrival, "departure": departure,
                    "guest_name": "; ".join(dict.fromkeys(breakfast_guest_names))[:255] or None,
                }
                current_day += timedelta(days=1)

        aggregates = [
            BetterHotelBreakfastAggregate(
                service_date=service_date,
                source_key=build_breakfast_source_key(
                    service_date=service_date,
                    reservation_ids=set(payload["reservation_ids"]),
                ),
                room_number=room_number,
                guest_count=int(payload["count"]),
                guest_name="; ".join(dict.fromkeys(str(name).strip() for name in payload["names"] if str(name).strip())) or None,
                guest_names="; ".join(dict.fromkeys(str(name).strip() for name in payload["all_names"] if str(name).strip())) or None,
                country_code=next(iter(dict.fromkeys(payload["country_codes"])), None),
                housekeeping_note="\n".join(dict.fromkeys(payload["housekeeping_notes"])) or None,
                reservations=payload["reservations"],
            )
            for (service_date, room_number), payload in grouped.items()
        ]
        aggregates.sort(key=lambda item: (item.service_date.isoformat(), item.room_number))
        source_hash = hashlib.sha256(
            json.dumps(
                [
                    {
                        "service_date": item.service_date.isoformat(),
                        "source_key": item.source_key,
                        "room_number": item.room_number,
                        "guest_count": item.guest_count,
                        "guest_name": item.guest_name,
                        "guest_names": item.guest_names,
                        "country_code": item.country_code,
                        "housekeeping_note": item.housekeeping_note,
                    }
                    for item in aggregates
                ],
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        return aggregates, len(reservations), source_hash


def sync_breakfast_range(
    db: Session,
    *,
    settings: Settings,
    range_start: date,
    range_end: date,
    trigger: str,
    note: str | None = None,
    progress: Callable[[str, str], None] | None = None,
) -> BetterHotelSyncResult:
    if range_end < range_start:
        raise BetterHotelSyncError("Rozsah synchronizace snídaní je neplatný.")

    started_at = utc_now()
    source_imported_at = utc_now()
    client = BetterHotelBreakfastClient(settings)
    errors: list[str] = []

    def report(step: str, message: str) -> None:
        if progress is not None:
            progress(step, message)

    report("api", "Načítám rezervace z Better Hotel API.")
    try:
        aggregates, reservations_count, source_hash = client.build_aggregates(
            service_start=range_start,
            service_end=range_end,
        )
    except Exception as exc:
        errors.append(str(exc))
        _persist_run_log(
            db,
            started_at=started_at,
            finished_at=utc_now(),
            ok=False,
            trigger=trigger,
            details={
                "range_start": range_start.isoformat(),
                "range_end": range_end.isoformat(),
                "processed_days": (range_end - range_start).days + 1,
                "imported_days": 0,
                "imported_rows": 0,
                "replaced_future_count": 0,
                "reservations_count": 0,
                "errors": errors,
            },
        )
        raise

    report("transform", "Mapuji rezervace na denní snídaňové položky.")
    rows_by_day: dict[date, list[BetterHotelBreakfastAggregate]] = defaultdict(list)
    for item in aggregates:
        rows_by_day[item.service_date].append(item)

    today_local = prague_today()
    replaced_future_count = 0
    imported_days = 0
    imported_rows = 0
    processed_days = (range_end - range_start).days + 1

    try:
        ensure_diets(db, {key: value for aggregate in aggregates for key, value in aggregate.reservations.items()})
        for day_offset in range(processed_days):
            target_day = range_start + timedelta(days=day_offset)
            existing_rows = db.scalars(
                select(BreakfastOrder).where(BreakfastOrder.service_date == target_day)
            ).all()
            preserved_by_source_key: dict[str, dict[str, Any]] = {}
            preserved_by_legacy_room: dict[str, dict[str, Any]] = {}
            for row in existing_rows:
                preserved = {
                    "status": row.status,
                }
                if row.source_key:
                    preserved_by_source_key[row.source_key] = preserved
                elif row.room_number not in preserved_by_legacy_room:
                    preserved_by_legacy_room[row.room_number] = preserved
            if target_day > today_local and existing_rows:
                replaced_future_count += 1

            day_rows = rows_by_day.get(target_day, [])
            if day_rows:
                imported_days += 1
            existing_by_key = {row.source_key: row for row in existing_rows if row.source_key}
            retained_ids: set[int] = set()
            for row in day_rows:
                preserved = preserved_by_source_key.get(row.source_key)
                if preserved is None:
                    preserved = preserved_by_legacy_room.get(row.room_number, {})
                existing = existing_by_key.get(row.source_key)
                if existing is None:
                    existing = BreakfastOrder(
                        service_date=row.service_date,
                        source_key=row.source_key,
                        status=str(preserved.get("status") or BreakfastStatus.PENDING.value),
                        note=row.housekeeping_note,
                    )
                    db.add(existing)
                existing.room_number = row.room_number
                existing.note = row.housekeeping_note
                existing.guest_name = (row.guest_name or f"Pokoj {row.room_number}")[:255]
                existing.guest_names = row.guest_names
                existing.country_code = row.country_code
                existing.guest_count = max(1, int(row.guest_count))
                db.flush()
                retained_ids.add(existing.id)
                imported_rows += 1
            for existing in existing_rows:
                if existing.id not in retained_ids:
                    db.delete(existing)
            db.flush()
            project_flags(db, list(db.scalars(select(BreakfastOrder).where(BreakfastOrder.service_date == target_day))))
            stamp_key = f"better-hotel:current:{target_day.isoformat()}"
            stamp = db.scalar(select(BreakfastImportProcessedAttachment).where(BreakfastImportProcessedAttachment.message_uid == stamp_key))
            if stamp is None:
                stamp = BreakfastImportProcessedAttachment(message_uid=stamp_key, parsed_day=target_day)
                db.add(stamp)
            stamp.attachment_hash = source_hash
            stamp.imported_at = source_imported_at

        finished_at = utc_now()
        details = {
            "range_start": range_start.isoformat(),
            "range_end": range_end.isoformat(),
            "processed_days": processed_days,
            "imported_days": imported_days,
            "imported_rows": imported_rows,
            "replaced_future_count": replaced_future_count,
            "reservations_count": reservations_count,
            "errors": errors,
        }
        db.add(
            BreakfastImportRunLog(
                started_at=started_at,
                finished_at=finished_at,
                ok=True,
                trigger=trigger,
                details_json=json.dumps(details, ensure_ascii=False),
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        details = {
            "range_start": range_start.isoformat(),
            "range_end": range_end.isoformat(),
            "processed_days": processed_days,
            "imported_days": 0,
            "imported_rows": 0,
            "replaced_future_count": 0,
            "reservations_count": reservations_count,
            "errors": ["Transakce synchronizace byla vrácena zpět."],
        }
        _persist_run_log(
            db,
            started_at=started_at,
            finished_at=utc_now(),
            ok=False,
            trigger=trigger,
            details=details,
        )
        raise

    report(
        "done",
        (
            f"Synchronizace dokončena pro {range_start.isoformat()} až {range_end.isoformat()}: "
            f"{imported_rows} položek, {imported_days} dnů."
        ),
    )
    return BetterHotelSyncResult(
        ok=True,
        trigger=trigger,
        range_start=range_start,
        range_end=range_end,
        processed_days=processed_days,
        imported_days=imported_days,
        imported_rows=imported_rows,
        replaced_future_count=replaced_future_count,
        reservations_count=reservations_count,
        errors=errors,
        source_imported_at=source_imported_at,
    )


def _persist_run_log(
    db: Session,
    *,
    started_at: datetime,
    finished_at: datetime,
    ok: bool,
    trigger: str,
    details: dict[str, Any],
) -> None:
    db.add(
        BreakfastImportRunLog(
            started_at=started_at,
            finished_at=finished_at,
            ok=ok,
            trigger=trigger,
            details_json=json.dumps(details, ensure_ascii=False),
        )
    )
    db.commit()
