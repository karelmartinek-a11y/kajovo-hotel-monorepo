from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path

from app.config import get_settings
from app.db.session import SessionLocal
from app.services.breakfast.mail_fetcher import BreakfastMailFetcher
from app.time_utils import utc_now, utc_today

log = logging.getLogger("kajovo.breakfast.scheduler")


@dataclass(frozen=True)
class BreakfastSchedulerResult:
    ok: bool
    service_date: str
    attempt: int
    imported: bool
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


def run_breakfast_scheduler_iteration(
    *,
    fetcher: BreakfastMailFetcher,
    target_day=None,
    attempt: int = 1,
) -> BreakfastSchedulerResult:
    service_day = target_day or utc_today()
    db = SessionLocal()
    try:
        imported = fetcher.fetch_and_store_for_day(db, service_day)
        result = BreakfastSchedulerResult(
            ok=True,
            service_date=service_day.isoformat(),
            attempt=attempt,
            imported=imported,
        )
        _write_runtime_artifact(result)
        return result
    except Exception as exc:
        log.exception("Breakfast scheduler iteration failed")
        result = BreakfastSchedulerResult(
            ok=False,
            service_date=service_day.isoformat(),
            attempt=attempt,
            imported=False,
            error=str(exc),
        )
        _write_runtime_artifact(result)
        return result
    finally:
        db.close()


async def breakfast_scheduler_loop() -> None:
    settings = get_settings()
    fetcher = BreakfastMailFetcher(settings)
    interval = max(60, int(settings.breakfast_scheduler_interval_seconds))
    retry_interval = max(5, int(settings.breakfast_scheduler_retry_seconds))
    max_retries = max(1, int(settings.breakfast_scheduler_max_retries))

    while True:
        try:
            result = await asyncio.to_thread(
                run_breakfast_scheduler_iteration,
                fetcher=fetcher,
                target_day=utc_today(),
                attempt=1,
            )
            if not result.ok:
                for attempt in range(2, max_retries + 1):
                    log.warning(
                        "Retrying breakfast scheduler iteration",
                        extra={"context": {"attempt": attempt, "service_date": result.service_date}},
                    )
                    await asyncio.sleep(retry_interval)
                    result = await asyncio.to_thread(
                        run_breakfast_scheduler_iteration,
                        fetcher=fetcher,
                        target_day=utc_today(),
                        attempt=attempt,
                    )
                    if result.ok:
                        break
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Breakfast scheduler iteration failed")
        await asyncio.sleep(interval)
