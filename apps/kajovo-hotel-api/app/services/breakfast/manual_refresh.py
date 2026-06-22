from __future__ import annotations

import json
import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import BreakfastManualRefreshJob
from app.db.session import SessionLocal
from app.services.breakfast.sync import BetterHotelSyncError, sync_breakfast_range
from app.time_utils import utc_now

log = logging.getLogger("kajovo.breakfast.manual_refresh")

MAX_PROGRESS_ENTRIES = 20


@dataclass(frozen=True)
class ManualRefreshProgressEntry:
    at: str
    step: str
    message: str


def _parse_progress_json(raw: str | None) -> list[ManualRefreshProgressEntry]:
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    entries: list[ManualRefreshProgressEntry] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        at = str(item.get("at") or "")
        step = str(item.get("step") or "")
        message = str(item.get("message") or "")
        if at and step and message:
            entries.append(ManualRefreshProgressEntry(at=at, step=step, message=message))
    return entries


def _dump_progress(entries: list[ManualRefreshProgressEntry]) -> str:
    payload = [
        {"at": entry.at, "step": entry.step, "message": entry.message}
        for entry in entries[-MAX_PROGRESS_ENTRIES:]
    ]
    return json.dumps(payload, ensure_ascii=False)


def _load_job(db: Session, job_key: str) -> BreakfastManualRefreshJob:
    job = db.scalar(select(BreakfastManualRefreshJob).where(BreakfastManualRefreshJob.job_key == job_key))
    if job is None:
        raise LookupError(f"Manual refresh job {job_key} not found")
    return job


def _set_job_state(
    db: Session,
    job_key: str,
    *,
    status: str,
    message: str | None = None,
    error_message: str | None = None,
    imported_count: int | None = None,
    started_at=None,
    finished_at=None,
) -> BreakfastManualRefreshJob:
    job = _load_job(db, job_key)
    job.status = status
    if message is not None:
        job.message = message
    if error_message is not None:
        job.error_message = error_message
    if imported_count is not None:
        job.imported_count = imported_count
    if started_at is not None:
        job.started_at = started_at
    if finished_at is not None:
        job.finished_at = finished_at
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _append_progress(
    db: Session,
    job_key: str,
    *,
    step: str,
    message: str,
) -> None:
    job = _load_job(db, job_key)
    entries = _parse_progress_json(job.progress_json)
    entries.append(
        ManualRefreshProgressEntry(
            at=utc_now().isoformat(),
            step=step,
            message=message,
        )
    )
    job.progress_json = _dump_progress(entries)
    job.message = message
    db.add(job)
    db.commit()
    db.refresh(job)


def _run_manual_sync_job(job_key: str) -> None:
    settings = get_settings()
    with SessionLocal() as db:
        job = _load_job(db, job_key)
        started_at = utc_now()
        _set_job_state(
            db,
            job_key,
            status="running",
            message="Spouštím synchronizaci snídaní z Better Hotel API.",
            started_at=started_at,
        )
        try:
            result = sync_breakfast_range(
                db,
                settings=settings,
                range_start=job.service_date,
                range_end=job.service_date,
                trigger="manual_api",
                note="Ruční synchronizace Better Hotel API",
                progress=lambda step, message: _append_progress(db, job_key, step=step, message=message),
            )
            _set_job_state(
                db,
                job_key,
                status="succeeded",
                message=(
                    f"Ruční synchronizace dokončena pro {result.range_start.isoformat()}: "
                    f"{result.imported_rows} položek."
                ),
                imported_count=result.imported_rows,
                finished_at=utc_now(),
            )
        except Exception as exc:
            db.rollback()
            safe_message = (
                str(exc)
                if isinstance(exc, BetterHotelSyncError)
                else "Synchronizace snídaní z Better Hotel API selhala."
            )
            try:
                _set_job_state(
                    db,
                    job_key,
                    status="failed",
                    message="Ruční synchronizace selhala.",
                    error_message=safe_message,
                    finished_at=utc_now(),
                )
            except Exception:
                log.exception("Manual breakfast job state update failed", extra={"context": {"job_key": job_key}})
            log.exception("Manual breakfast refresh failed", extra={"context": {"job_key": job_key}})


def start_manual_breakfast_refresh(db: Session, service_date: date) -> BreakfastManualRefreshJob:
    job = BreakfastManualRefreshJob(
        job_key=uuid.uuid4().hex,
        service_date=service_date,
        status="queued",
        progress_json=_dump_progress(
            [
                ManualRefreshProgressEntry(
                    at=utc_now().isoformat(),
                    step="queued",
                    message="Žádost byla zařazena do fronty.",
                )
            ]
        ),
        message="Žádost byla zařazena do fronty.",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    thread = threading.Thread(
        target=_run_manual_sync_job,
        args=(job.job_key,),
        name=f"breakfast-manual-refresh-{job.job_key}",
        daemon=True,
    )
    thread.start()
    return job


def get_manual_breakfast_refresh_job(db: Session, job_id: int) -> BreakfastManualRefreshJob | None:
    return db.get(BreakfastManualRefreshJob, job_id)
