from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

UTC = timezone.utc


def utc_now() -> datetime:
    return datetime.now(UTC)


def ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def utc_after(*, seconds: int = 0, minutes: int = 0, hours: int = 0, days: int = 0) -> datetime:
    return utc_now() + timedelta(seconds=seconds, minutes=minutes, hours=hours, days=days)


def utc_today() -> date:
    return utc_now().date()


def utc_timestamp(value: datetime | None = None) -> int:
    return int((ensure_utc(value) or utc_now()).timestamp())
