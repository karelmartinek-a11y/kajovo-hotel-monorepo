from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path

from app.config import get_settings
from app.db.session import SessionLocal
from app.services.breakfast.sync import (
    PRAGUE_TZ,
    default_sync_range,
    is_scheduled_now,
    prague_today,
    sync_breakfast_range,
)
from app.time_utils import utc_now

log = logging.getLogger("kajovo.breakfast.scheduler")


@dataclass(frozen=True)
class BreakfastSchedulerResult:
    ok: bool
    range_start: str
    range_end: str
    attempt: int
    imported: bool
    imported_days: int = 0
    imported_rows: int = 0
    replaced_future_count: int = 0
    reservations_count: int = 0
    processed_days: int = 0
    error: str | None = None


def _write_runtime_artifact(result: BreakfastSchedulerResult) -> None:
    settings = get_settings()
    artifact_dir = Path(settings.breakfast_runtime_artifact_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    latest_path = artifact_dir / "breakfast-scheduler-latest.json"
    latest_path.write_text(
        json.dumps(
            {
                **asdict(result),
                "generated_at": utc_now().isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def run_breakfast_scheduler_iteration(*, attempt: int = 1) -> BreakfastSchedulerResult:
    settings = get_settings()
    today_local = prague_today()
    range_start, range_end = default_sync_range(today=today_local, settings=settings)
    now_local = utc_now().astimezone(PRAGUE_TZ)

    if not is_scheduled_now(now_local, settings.breakfast_scheduler_interval_seconds):
        result = BreakfastSchedulerResult(
            ok=True,
            range_start=range_start.isoformat(),
            range_end=range_end.isoformat(),
            attempt=attempt,
            imported=False,
            processed_days=(range_end - range_start).days + 1,
        )
        _write_runtime_artifact(result)
        return result

    db = SessionLocal()
    try:
        run_result = sync_breakfast_range(
            db,
            settings=settings,
            range_start=range_start,
            range_end=range_end,
            trigger="scheduler_api",
            note="Automatická synchronizace Better Hotel API",
        )
        result = BreakfastSchedulerResult(
            ok=run_result.ok,
            range_start=run_result.range_start.isoformat(),
            range_end=run_result.range_end.isoformat(),
            attempt=attempt,
            imported=run_result.imported_rows > 0,
            imported_days=run_result.imported_days,
            imported_rows=run_result.imported_rows,
            replaced_future_count=run_result.replaced_future_count,
            reservations_count=run_result.reservations_count,
            processed_days=run_result.processed_days,
            error="; ".join(run_result.errors) if run_result.errors else None,
        )
        _write_runtime_artifact(result)
        return result
    except Exception as exc:
        log.exception("Breakfast scheduler iteration failed")
        result = BreakfastSchedulerResult(
            ok=False,
            range_start=range_start.isoformat(),
            range_end=range_end.isoformat(),
            attempt=attempt,
            imported=False,
            processed_days=(range_end - range_start).days + 1,
            error=str(exc),
        )
        _write_runtime_artifact(result)
        return result
    finally:
        db.close()


async def breakfast_scheduler_loop() -> None:
    settings = get_settings()
    interval = max(60, int(settings.breakfast_scheduler_interval_seconds))
    retry_interval = max(5, int(settings.breakfast_scheduler_retry_seconds))
    max_retries = max(1, int(settings.breakfast_scheduler_max_retries))

    while True:
        try:
            result = await asyncio.to_thread(
                run_breakfast_scheduler_iteration,
                attempt=1,
            )
            if not result.ok:
                for attempt in range(2, max_retries + 1):
                    log.warning(
                        "Retrying breakfast scheduler iteration",
                        extra={"context": {"attempt": attempt, "range_start": result.range_start, "range_end": result.range_end}},
                    )
                    await asyncio.sleep(retry_interval)
                    result = await asyncio.to_thread(
                        run_breakfast_scheduler_iteration,
                        attempt=attempt,
                    )
                    if result.ok:
                        break
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Breakfast scheduler iteration failed")
        await asyncio.sleep(interval)
