from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.breakfast.sync import is_scheduled_now


def _dt(value: str) -> datetime:
    return datetime.fromisoformat(value).replace(tzinfo=ZoneInfo("Europe/Prague"))


def test_scheduler_accepts_run_inside_interval_window() -> None:
    now_local = _dt("2026-05-08T14:03:00")
    assert is_scheduled_now(now_local, 300) is True


def test_scheduler_rejects_run_outside_interval_window() -> None:
    now_local = _dt("2026-05-08T14:08:00")
    assert is_scheduled_now(now_local, 300) is False


def test_scheduler_handles_previous_day_slot_window() -> None:
    now_local = _dt("2026-05-09T00:04:00")
    assert is_scheduled_now(now_local, 900) is True
