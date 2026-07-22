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
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.models import (
    BreakfastImportProcessedAttachment,
    BreakfastImportRunLog,
    BreakfastOrder,
    BreakfastStatus,
)
from app.time_utils import utc_now

log = logging.getLogger("kajovo.breakfast.sync")

PRAGUE_TZ = ZoneInfo("Europe/Prague")
SCHEDULE_TIMES = ("14:00", "16:00", "18:00", "20:00", "22:20", "23:50")
DEFAULT_BREAKFAST_FOOD_CODES = frozenset({1, 2, 3})
SYSTEM_SYNC_NOTE_PREFIXES = (
    "Automatická synchronizace Better Hotel",
    "Automaticka synchronizace Better Hotel",
    "Ruční synchronizace Better Hotel",
    "Rucni synchronizace Better Hotel",
)


class BetterHotelSyncError(RuntimeError):
    pass


@dataclass(frozen=True)
class BetterHotelBreakfastAggregate:
    service_date: date
    room_number: str
    guest_count: int
    guest_name: str | None


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


def is_scheduled_now(now_local: datetime, interval_seconds: int) -> bool:
    interval = max(60, int(interval_seconds))
    window_start = now_local - timedelta(seconds=interval)
    for schedule_time in SCHEDULE_TIMES:
        hour_text, minute_text = schedule_time.split(":")
        slot_time = now_local.replace(
            hour=int(hour_text),
            minute=int(minute_text),
            second=0,
            microsecond=0,
        )
        if window_start <= slot_time <= now_local:
            return True
        previous_day_slot_time = slot_time - timedelta(days=1)
        if window_start <= previous_day_slot_time <= now_local:
            return True
    return False


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


def normalize_preserved_breakfast_note(note: str | None) -> str | None:
    if note is None:
        return None
    normalized = note.strip()
    if not normalized:
        return None
    if any(normalized.startswith(prefix) for prefix in SYSTEM_SYNC_NOTE_PREFIXES):
        return None
    return normalized


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
                    "expand[]": ["guest_list", "guest_list.guest", "room"],
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
                    {"count": 0, "names": []},
                )
                current["count"] += breakfast_guest_count
                current["names"].extend(breakfast_guest_names)
                current_day += timedelta(days=1)

        aggregates = [
            BetterHotelBreakfastAggregate(
                service_date=service_date,
                room_number=room_number,
                guest_count=int(payload["count"]),
                guest_name="; ".join(dict.fromkeys(str(name).strip() for name in payload["names"] if str(name).strip())) or None,
            )
            for (service_date, room_number), payload in grouped.items()
        ]
        aggregates.sort(key=lambda item: (item.service_date.isoformat(), item.room_number))
        source_hash = hashlib.sha256(
            json.dumps(
                [
                    {
                        "service_date": item.service_date.isoformat(),
                        "room_number": item.room_number,
                        "guest_count": item.guest_count,
                        "guest_name": item.guest_name,
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
        for day_offset in range(processed_days):
            target_day = range_start + timedelta(days=day_offset)
            existing_rows = db.scalars(
                select(BreakfastOrder).where(BreakfastOrder.service_date == target_day)
            ).all()
            served_rows = {
                row.room_number: {
                    "room_number": row.room_number,
                    "guest_name": row.guest_name,
                    "guest_count": row.guest_count,
                    "note": row.note,
                    "diet_no_gluten": bool(row.diet_no_gluten),
                    "diet_no_milk": bool(row.diet_no_milk),
                    "diet_no_pork": bool(row.diet_no_pork),
                }
                for row in existing_rows
                if row.status == BreakfastStatus.SERVED.value
            }
            preserved_rows = (
                {
                    row.room_number: {
                        "diet_no_gluten": bool(row.diet_no_gluten),
                        "diet_no_milk": bool(row.diet_no_milk),
                        "diet_no_pork": bool(row.diet_no_pork),
                        "note": normalize_preserved_breakfast_note(row.note),
                    }
                    for row in existing_rows
                }
                if target_day >= today_local
                else {}
            )
            if target_day > today_local and existing_rows:
                replaced_future_count += 1

            for existing_row in existing_rows:
                db.expunge(existing_row)
            db.query(BreakfastOrder).filter(BreakfastOrder.service_date == target_day).delete(
                synchronize_session=False
            )
            db.flush()

            day_rows = rows_by_day.get(target_day, [])
            if day_rows:
                imported_days += 1
            for row in day_rows:
                preserved = preserved_rows.get(row.room_number, {})
                served = served_rows.get(row.room_number)
                db.add(
                    BreakfastOrder(
                        service_date=row.service_date,
                        room_number=row.room_number,
                        guest_name=row.guest_name or f"Pokoj {row.room_number}",
                        guest_count=max(1, int(row.guest_count)),
                        status=(
                            BreakfastStatus.SERVED.value
                            if served is not None
                            else BreakfastStatus.PENDING.value
                        ),
                        note=preserved.get("note") or None,
                        diet_no_gluten=bool(preserved.get("diet_no_gluten", False)),
                        diet_no_milk=bool(preserved.get("diet_no_milk", False)),
                        diet_no_pork=bool(preserved.get("diet_no_pork", False)),
                    )
                )
                imported_rows += 1
            imported_rooms = {row.room_number for row in day_rows}
            for served in served_rows.values():
                if served["room_number"] in imported_rooms:
                    continue
                db.add(
                    BreakfastOrder(
                        service_date=target_day,
                        room_number=served["room_number"],
                        guest_name=served["guest_name"],
                        guest_count=served["guest_count"],
                        status=BreakfastStatus.SERVED.value,
                        note=served["note"],
                        diet_no_gluten=bool(served["diet_no_gluten"]),
                        diet_no_milk=bool(served["diet_no_milk"]),
                        diet_no_pork=bool(served["diet_no_pork"]),
                    )
                )
            db.add(
                BreakfastImportProcessedAttachment(
                    message_uid=f"better-hotel:{trigger}:{range_start.isoformat()}:{range_end.isoformat()}:{target_day.isoformat()}",
                    attachment_hash=source_hash,
                    parsed_day=target_day,
                    imported_at=source_imported_at,
                )
            )

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
