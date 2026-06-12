from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
import tempfile
import threading
import uuid
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import (
    BreakfastImportProcessedAttachment,
    BreakfastImportRunLog,
    BreakfastManualRefreshJob,
    BreakfastOrder,
    BreakfastStatus,
)
from app.db.session import SessionLocal
from app.services.breakfast.mail_fetcher import BreakfastMailFetcher, BreakfastMailboxPdfCandidate
from app.services.breakfast.parser import BreakfastRow, parse_breakfast_pdf
from app.time_utils import utc_now

log = logging.getLogger("kajovo.breakfast.manual_refresh")

MAX_PROGRESS_ENTRIES = 20


def _resolve_repo_root() -> Path:
    explicit_root = os.environ.get("KAJOVO_REPO_ROOT", "").strip()
    if explicit_root:
        return Path(explicit_root).resolve()

    current = Path(__file__).resolve()
    for candidate in (current.parent, *current.parents):
        if (candidate / "scripts").is_dir() and (candidate / "apps").is_dir():
            return candidate

    return current.parent


def _resolve_playwright_script() -> Path:
    explicit_script = os.environ.get("KAJOVO_BETTER_HOTEL_REFRESH_SCRIPT", "").strip()
    if explicit_script:
        return Path(explicit_script).resolve()

    return _resolve_repo_root() / "scripts" / "better_hotel_refresh.mjs"


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


def _append_progress(
    db: Session,
    job: BreakfastManualRefreshJob,
    *,
    step: str,
    message: str,
) -> None:
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
    progress_entries: list[ManualRefreshProgressEntry] | None = None,
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
    if progress_entries is not None:
        job.progress_json = _dump_progress(progress_entries)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _persist_import(
    db: Session,
    *,
    job: BreakfastManualRefreshJob,
    target_day: date,
    rows: list[BreakfastRow],
    pdf_bytes: bytes,
) -> int:
    db.execute(delete(BreakfastOrder).where(BreakfastOrder.service_date == target_day))
    for row in rows:
        db.add(
            BreakfastOrder(
                service_date=row.day,
                room_number=row.room,
                guest_name=row.guest_name or f"Pokoj {row.room}",
                guest_count=max(1, int(row.breakfast_count)),
                status=BreakfastStatus.PENDING.value,
                note="Ruční import Better Hotel",
                diet_no_gluten=False,
                diet_no_milk=False,
                diet_no_pork=False,
            )
        )
    db.add(
        BreakfastImportProcessedAttachment(
            message_uid=f"manual:{job.job_key}",
            attachment_hash=hashlib.sha256(pdf_bytes).hexdigest(),
            parsed_day=target_day,
        )
    )
    return len(rows)


def _playwright_refresh_is_available() -> bool:
    settings = get_settings()
    if not settings.better_hotel_base_url.strip():
        return False
    if not settings.better_hotel_username.strip():
        return False
    if not settings.better_hotel_password.strip():
        return False
    return _resolve_playwright_script().is_file()


def _write_run_log(
    db: Session,
    *,
    started_at,
    ok: bool,
    trigger: str,
    imported_count: int,
    errors: list[str],
) -> None:
    details = {
        "imported_count": imported_count,
        "errors": errors,
    }
    db.add(
        BreakfastImportRunLog(
            started_at=started_at,
            finished_at=utc_now(),
            ok=ok,
            trigger=trigger,
            details_json=json.dumps(details, ensure_ascii=False),
        )
    )
    db.commit()


def _run_mailbox_refresh_job(job_key: str, *, fallback_reason: str | None = None) -> None:
    settings = get_settings()
    with SessionLocal() as db:
        job = _load_job(db, job_key)
        started_at = utc_now()
        _set_job_state(
            db,
            job_key,
            status="running",
            message="Hledám poslední přehled stravy v mailboxu.",
            started_at=started_at,
        )
        if fallback_reason:
            _append_progress(db, job, step="fallback", message=fallback_reason)
        try:
            fetcher = BreakfastMailFetcher(settings)
            _append_progress(db, job, step="mailbox", message="Připojuji se do schránky s přehledy stravy.")
            candidate = fetcher.find_latest_pdf_for_day(db, target_day=job.service_date)
            if candidate is None:
                raise RuntimeError(
                    f"Ve schránce nebyl nalezen PDF přehled pro den {job.service_date.isoformat()}."
                )
            _append_progress(
                db,
                job,
                step="mailbox",
                message=(
                    "Nalezen odpovídající e-mailový přehled "
                    f"(prohledáno {candidate.scanned_messages} zpráv, shoda {candidate.matched_messages})."
                ),
            )
            imported_count = _import_mailbox_candidate(
                db,
                job=job,
                candidate=candidate,
            )
            _write_run_log(
                db,
                started_at=started_at,
                ok=True,
                trigger="manual_mailbox",
                imported_count=imported_count,
                errors=[],
            )
            _set_job_state(
                db,
                job_key,
                status="succeeded",
                message="Ruční import dokončen z posledního e-mailového PDF.",
                imported_count=imported_count,
                finished_at=utc_now(),
            )
        except Exception as exc:
            db.rollback()
            errors = [f"{type(exc).__name__}: {exc}"]
            try:
                _write_run_log(
                    db,
                    started_at=started_at,
                    ok=False,
                    trigger="manual_mailbox",
                    imported_count=0,
                    errors=errors,
                )
            except Exception:
                log.exception("Manual mailbox breakfast run log write failed", extra={"context": {"job_key": job_key}})
            try:
                _set_job_state(
                    db,
                    job_key,
                    status="failed",
                    message="Ruční import selhal.",
                    error_message=str(exc),
                    finished_at=utc_now(),
                )
            except Exception:
                log.exception("Manual mailbox breakfast job state update failed", extra={"context": {"job_key": job_key}})
            log.exception("Manual mailbox breakfast refresh failed", extra={"context": {"job_key": job_key}})


def _import_mailbox_candidate(
    db: Session,
    *,
    job: BreakfastManualRefreshJob,
    candidate: BreakfastMailboxPdfCandidate,
) -> int:
    _append_progress(db, job, step="parse", message="Zpracovávám PDF z mailboxu.")
    if candidate.parsed_day != job.service_date:
        _append_progress(
            db,
            job,
            step="validate",
            message=(
                f"PDF je primárně pro den {candidate.parsed_day.isoformat()}, "
                f"použiji položky pro {job.service_date.isoformat()}."
            ),
        )
    target_rows = [row for row in candidate.rows if row.day == job.service_date]
    if not target_rows:
        raise RuntimeError(f"PDF neobsahuje žádné položky pro den {job.service_date.isoformat()}.")
    imported_count = _persist_import(
        db,
        job=job,
        target_day=job.service_date,
        rows=target_rows,
        pdf_bytes=candidate.pdf_bytes,
    )
    db.add(
        BreakfastImportProcessedAttachment(
            message_uid=f"{candidate.message_uid}:manual:{job.job_key}",
            attachment_hash=candidate.attachment_hash,
            parsed_day=job.service_date,
        )
    )
    db.commit()
    return imported_count


def _run_test_refresh_job(job_key: str) -> None:
    with SessionLocal() as db:
        job = _load_job(db, job_key)
        started_at = utc_now()
        _set_job_state(
            db,
            job_key,
            status="running",
            message="Testovací ruční import běží.",
            started_at=started_at,
        )

        if job.service_date.day in {12, 13}:
            error_message = (
                "Přihlášení do Better Hotelu selhalo."
                if job.service_date.day == 12
                else "PDF neobsahuje položky pro zvolený den."
            )
            _write_run_log(
                db,
                started_at=started_at,
                ok=False,
                trigger="manual_playwright",
                imported_count=0,
                errors=[error_message],
            )
            _set_job_state(
                db,
                job_key,
                status="failed",
                message="Ruční import selhal.",
                error_message=error_message,
                finished_at=utc_now(),
            )
            return

        target_rows = [
            BreakfastRow(
                day=job.service_date,
                room="101",
                breakfast_count=2,
                guest_name="Nový host 1",
            ),
            BreakfastRow(
                day=job.service_date,
                room="102",
                breakfast_count=1,
                guest_name="Nový host 2",
            ),
        ]
        pdf_bytes = f"test-manual-refresh-{job.service_date.isoformat()}".encode("utf-8")
        imported_count = _persist_import(
            db,
            job=job,
            target_day=job.service_date,
            rows=target_rows,
            pdf_bytes=pdf_bytes,
        )
        _write_run_log(
            db,
            started_at=started_at,
            ok=True,
            trigger="manual_playwright",
            imported_count=imported_count,
            errors=[],
        )
        _set_job_state(
            db,
            job_key,
            status="succeeded",
            message="Ruční import dokončen.",
            imported_count=imported_count,
            finished_at=utc_now(),
        )


def _run_playwright_job(job_key: str) -> None:
    settings = get_settings()
    if str(settings.better_hotel_refresh_mode).lower() == "test":
        _run_test_refresh_job(job_key)
        return
    if not _playwright_refresh_is_available():
        _run_mailbox_refresh_job(
            job_key,
            fallback_reason=(
                "Better Hotel browser refresh není nakonfigurovaný, "
                "použiji poslední dostupný e-mailový přehled."
            ),
        )
        return
    with SessionLocal() as db:
        job = _load_job(db, job_key)
        started_at = utc_now()
        _set_job_state(
            db,
            job_key,
            status="running",
            message="Spouštím prohlížeč Better Hotel.",
            started_at=started_at,
        )
        temp_dir = Path(tempfile.mkdtemp(prefix=f"kajovo-better-hotel-{job_key}-"))
        output_pdf = temp_dir / f"breakfast-{job.service_date.isoformat()}.pdf"
        env = os.environ.copy()
        env.update(
            {
                "BETTER_HOTEL_BASE_URL": settings.better_hotel_base_url,
                "BETTER_HOTEL_LOGIN_PATH": settings.better_hotel_login_path,
                "BETTER_HOTEL_REPORT_URL_TEMPLATE": settings.better_hotel_report_url_template,
                "BETTER_HOTEL_USERNAME": settings.better_hotel_username,
                "BETTER_HOTEL_PASSWORD": settings.better_hotel_password,
                "BETTER_HOTEL_OUTPUT_PATH": str(output_pdf),
                "BETTER_HOTEL_SERVICE_DATE": job.service_date.isoformat(),
                "BETTER_HOTEL_JOB_KEY": job.job_key,
                "BETTER_HOTEL_TIMEOUT_SECONDS": str(settings.better_hotel_playwright_timeout_seconds),
            }
        )
        log.info("Starting manual breakfast refresh job", extra={"context": {"job_key": job_key}})
        try:
            repo_root = _resolve_repo_root()
            playwright_script = _resolve_playwright_script()
            command = ["node", str(playwright_script)]
            process = subprocess.Popen(
                command,
                cwd=str(repo_root),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
            assert process.stdout is not None
            script_result: dict[str, object] | None = None
            for raw_line in process.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                if line.startswith("PROGRESS "):
                    try:
                        payload = json.loads(line.removeprefix("PROGRESS ").strip())
                        if isinstance(payload, dict):
                            _append_progress(
                                db,
                                job,
                                step=str(payload.get("step") or "runner"),
                                message=str(payload.get("message") or line),
                            )
                        continue
                    except json.JSONDecodeError:
                        pass
                if line.startswith("RESULT "):
                    try:
                        payload = json.loads(line.removeprefix("RESULT ").strip())
                        if isinstance(payload, dict):
                            script_result = payload
                    except json.JSONDecodeError:
                        pass
                    continue
                _append_progress(db, job, step="runner", message=line)
            exit_code = process.wait()
            if exit_code != 0:
                raise RuntimeError(f"Playwright skončil s kódem {exit_code}.")
            if not output_pdf.exists():
                raise RuntimeError("Playwright nevytvořil PDF soubor.")

            _append_progress(db, job, step="parse", message="Zpracovávám vygenerované PDF.")
            pdf_bytes = output_pdf.read_bytes()
            parsed_day, rows = parse_breakfast_pdf(pdf_bytes)
            if parsed_day != job.service_date:
                _append_progress(
                    db,
                    job,
                    step="validate",
                    message=(
                        f"PDF je pro den {parsed_day.isoformat()}, očekávám {job.service_date.isoformat()}."
                    ),
                )
            target_rows = [row for row in rows if row.day == job.service_date]
            if not target_rows:
                raise RuntimeError(
                    f"PDF neobsahuje žádné položky pro den {job.service_date.isoformat()}."
                )

            imported_count = _persist_import(
                db,
                job=job,
                target_day=job.service_date,
                rows=target_rows,
                pdf_bytes=pdf_bytes,
            )
            _write_run_log(
                db,
                started_at=started_at,
                ok=True,
                trigger="manual_playwright",
                imported_count=imported_count,
                errors=[],
            )
            _set_job_state(
                db,
                job_key,
                status="succeeded",
                message=(
                    str(script_result.get("message")) if script_result and script_result.get("message") else "Ruční import dokončen."
                ),
                imported_count=imported_count,
                finished_at=utc_now(),
            )
        except Exception as exc:
            db.rollback()
            errors = [f"{type(exc).__name__}: {exc}"]
            try:
                _write_run_log(
                    db,
                    started_at=started_at,
                    ok=False,
                    trigger="manual_playwright",
                    imported_count=0,
                    errors=errors,
                )
            except Exception:
                log.exception("Manual breakfast run log write failed", extra={"context": {"job_key": job_key}})
            try:
                _set_job_state(
                    db,
                    job_key,
                    status="failed",
                    message="Ruční import selhal.",
                    error_message=str(exc),
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
        target=_run_playwright_job,
        args=(job.job_key,),
        name=f"breakfast-manual-refresh-{job.job_key}",
        daemon=True,
    )
    thread.start()
    return job


def get_manual_breakfast_refresh_job(db: Session, job_id: int) -> BreakfastManualRefreshJob | None:
    return db.get(BreakfastManualRefreshJob, job_id)
