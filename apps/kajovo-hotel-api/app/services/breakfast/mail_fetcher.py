from __future__ import annotations

import email
import hashlib
import imaplib
import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from email.message import Message
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    BreakfastImportMailboxSettings,
    BreakfastImportProcessedAttachment,
    BreakfastImportRunLog,
    BreakfastOrder,
    BreakfastStatus,
)
from app.services.breakfast.parser import parse_breakfast_pdf
from app.services.mail import decrypt_secret
from app.time_utils import utc_now

log = logging.getLogger("kajovo.breakfast.mail_fetcher")

SCHEDULE_TIMES = ("14:00", "16:00", "18:00", "20:00", "22:20", "23:50")
DEFAULT_FROM = "noreply=better-hotel.com@mg2.better-hotel.com"


@dataclass(frozen=True)
class BreakfastImportRunResult:
    ok: bool
    imported_count: int
    replaced_future_count: int
    matched_messages: int
    scanned_messages: int
    errors: list[str]


def _decode_header_value(value: str | None) -> str:
    if not value:
        return ""
    parts = email.header.decode_header(value)
    out: list[str] = []
    for part, encoding in parts:
        if isinstance(part, bytes):
            try:
                out.append(part.decode(encoding or "utf-8", errors="replace"))
            except LookupError:
                out.append(part.decode("utf-8", errors="replace"))
        else:
            out.append(str(part))
    return "".join(out).strip()


def _iter_pdf_attachments(msg: Message) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []
    for part in msg.walk() if msg.is_multipart() else [msg]:
        if part.is_multipart():
            continue
        ctype = (part.get_content_type() or "").lower()
        filename = _decode_header_value(part.get_filename() or "")
        is_pdf = filename.lower().endswith(".pdf") if filename else ctype == "application/pdf"
        if not is_pdf:
            continue
        payload = part.get_payload(decode=True)
        if isinstance(payload, (bytes, bytearray)) and payload:
            out.append((filename or "attachment.pdf", bytes(payload)))
    return out


def _is_scheduled_now(now_local: datetime, interval_seconds: int) -> bool:
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


class BreakfastMailFetcher:
    def __init__(self, settings: Settings):
        self.settings = settings

    def _load_mailbox_settings(self, db: Session) -> BreakfastImportMailboxSettings:
        row = db.get(BreakfastImportMailboxSettings, 1)
        if row is not None:
            return row
        return BreakfastImportMailboxSettings(
            id=1,
            enabled=True,
            host=self.settings.breakfast_imap_host,
            port=self.settings.breakfast_imap_port,
            use_ssl=self.settings.breakfast_imap_use_ssl,
            mailbox=self.settings.breakfast_imap_mailbox,
            username=self.settings.breakfast_imap_username,
            password_encrypted="",
            from_contains=self.settings.breakfast_imap_from_contains or DEFAULT_FROM,
            subject_contains=self.settings.breakfast_imap_subject_contains,
        )

    def _connect(self, config: BreakfastImportMailboxSettings) -> imaplib.IMAP4:
        password = decrypt_secret(config.password_encrypted, self.settings.smtp_encryption_key)
        if config.use_ssl:
            client = imaplib.IMAP4_SSL(config.host, config.port)
        else:
            client = imaplib.IMAP4(config.host, config.port)
        client.login(config.username, password)
        return client

    def _preserve_diets(self, db: Session, service_day: date) -> dict[str, dict[str, bool]]:
        current = db.scalars(
            select(BreakfastOrder).where(BreakfastOrder.service_date == service_day)
        ).all()
        return {
            row.room_number: {
                "diet_no_gluten": bool(row.diet_no_gluten),
                "diet_no_milk": bool(row.diet_no_milk),
                "diet_no_pork": bool(row.diet_no_pork),
            }
            for row in current
        }

    def run_mailbox_import(self, db: Session, *, trigger: str = "scheduler") -> BreakfastImportRunResult:
        started_at = utc_now()
        scanned_messages = 0
        matched_messages = 0
        imported_count = 0
        replaced_future_count = 0
        errors: list[str] = []

        config = self._load_mailbox_settings(db)
        now_local = utc_now().astimezone(ZoneInfo("Europe/Prague"))
        if trigger == "scheduler" and not _is_scheduled_now(
            now_local,
            self.settings.breakfast_scheduler_interval_seconds,
        ):
            return BreakfastImportRunResult(
                ok=True,
                imported_count=0,
                replaced_future_count=0,
                matched_messages=0,
                scanned_messages=0,
                errors=[],
            )
        if not config.enabled:
            return BreakfastImportRunResult(
                ok=True,
                imported_count=0,
                replaced_future_count=0,
                matched_messages=0,
                scanned_messages=0,
                errors=[],
            )

        missing = [
            name
            for name, value in {
                "host": config.host,
                "username": config.username,
                "password_encrypted": config.password_encrypted,
            }.items()
            if not str(value).strip()
        ]
        if missing:
            return self._persist_log(
                db,
                started_at=started_at,
                ok=False,
                trigger=trigger,
                scanned_messages=0,
                matched_messages=0,
                imported_count=0,
                replaced_future_count=0,
                errors=[f"Chybí konfigurace: {', '.join(missing)}"],
            )

        try:
            client = self._connect(config)
        except Exception as exc:
            return self._persist_log(
                db,
                started_at=started_at,
                ok=False,
                trigger=trigger,
                scanned_messages=0,
                matched_messages=0,
                imported_count=0,
                replaced_future_count=0,
                errors=[f"Přihlášení do schránky selhalo: {exc}"],
            )

        try:
            typ, _ = client.select(config.mailbox or "INBOX")
            if typ != "OK":
                return self._persist_log(
                    db,
                    started_at=started_at,
                    ok=False,
                    trigger=trigger,
                    scanned_messages=0,
                    matched_messages=0,
                    imported_count=0,
                    replaced_future_count=0,
                    errors=["Výběr schránky selhal"],
                )
            typ, data = client.search(None, "ALL")
            if typ != "OK" or not data:
                return self._persist_log(
                    db,
                    started_at=started_at,
                    ok=True,
                    trigger=trigger,
                    scanned_messages=0,
                    matched_messages=0,
                    imported_count=0,
                    replaced_future_count=0,
                    errors=[],
                )
            uids = data[0].split()
            for uid in reversed(uids):
                scanned_messages += 1
                uid_text = uid.decode("utf-8", "ignore")
                try:
                    typ, parts = client.fetch(uid, "(RFC822)")
                    if typ != "OK" or not parts:
                        errors.append(f"UID {uid_text}: fetch selhal")
                        continue
                    raw = parts[0][1] if isinstance(parts[0], tuple) else b""
                    if not raw:
                        continue
                    msg = email.message_from_bytes(raw)
                    from_header = _decode_header_value(msg.get("From")).lower()
                    subject = _decode_header_value(msg.get("Subject")).lower()
                    if config.from_contains.lower() not in from_header:
                        continue
                    if config.subject_contains and config.subject_contains.lower() not in subject:
                        continue
                    matched_messages += 1
                    for _, pdf_bytes in _iter_pdf_attachments(msg):
                        attachment_hash = hashlib.sha256(pdf_bytes).hexdigest()
                        parsed = db.scalar(
                            select(BreakfastImportProcessedAttachment).where(
                                BreakfastImportProcessedAttachment.message_uid == uid_text,
                                BreakfastImportProcessedAttachment.attachment_hash == attachment_hash,
                            )
                        )
                        if parsed is not None:
                            continue
                        try:
                            parsed_day, rows = parse_breakfast_pdf(pdf_bytes)
                        except ValueError:
                            errors.append(f"UID {uid_text}: pĹ™Ă­loha nenĂ­ validnĂ­ PDF snĂ­danĂ­")
                            continue
                        now_day = now_local.date()
                        rows_by_day: dict[date, list] = defaultdict(list)
                        for row in rows:
                            rows_by_day[row.day].append(row)
                        for target_day, day_rows in rows_by_day.items():
                            if target_day < now_day:
                                continue
                            preserve_diets = target_day > now_day
                            diet_map = self._preserve_diets(db, target_day) if preserve_diets else {}
                            existing_count = db.query(BreakfastOrder).filter(
                                BreakfastOrder.service_date == target_day
                            ).count()
                            db.query(BreakfastOrder).filter(BreakfastOrder.service_date == target_day).delete(
                                synchronize_session=False
                            )
                            for row in day_rows:
                                preserved = diet_map.get(str(row.room), {})
                                db.add(
                                    BreakfastOrder(
                                        service_date=row.day,
                                        room_number=row.room,
                                        guest_name=row.guest_name or f"Pokoj {row.room}",
                                        guest_count=max(1, int(row.breakfast_count)),
                                        status=BreakfastStatus.PENDING.value,
                                        note="Automatický import e-mailu",
                                        diet_no_gluten=bool(preserved.get("diet_no_gluten", False)),
                                        diet_no_milk=bool(preserved.get("diet_no_milk", False)),
                                        diet_no_pork=bool(preserved.get("diet_no_pork", False)),
                                    )
                                )
                            if preserve_diets and existing_count > 0:
                                replaced_future_count += 1
                        db.add(
                            BreakfastImportProcessedAttachment(
                                message_uid=uid_text,
                                attachment_hash=attachment_hash,
                                parsed_day=parsed_day,
                            )
                        )
                        db.commit()
                        imported_count += 1
                except Exception as exc:
                    db.rollback()
                    errors.append(f"UID {uid_text}: neočekávaná chyba importu ({type(exc).__name__})")
                    log.exception("breakfast.mail_fetcher.uid_failed", extra={"uid": uid_text})
        finally:
            try:
                client.logout()
            except Exception:
                pass
        return self._persist_log(
            db,
            started_at=started_at,
            ok=len(errors) == 0,
            trigger=trigger,
            scanned_messages=scanned_messages,
            matched_messages=matched_messages,
            imported_count=imported_count,
            replaced_future_count=replaced_future_count,
            errors=errors,
        )

    def _persist_log(
        self,
        db: Session,
        *,
        started_at: datetime,
        ok: bool,
        trigger: str,
        scanned_messages: int,
        matched_messages: int,
        imported_count: int,
        replaced_future_count: int,
        errors: list[str],
    ) -> BreakfastImportRunResult:
        finished_at = utc_now()
        details = {
            "scanned_messages": scanned_messages,
            "matched_messages": matched_messages,
            "imported_count": imported_count,
            "replaced_future_count": replaced_future_count,
            "errors": errors,
        }
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
        return BreakfastImportRunResult(
            ok=ok,
            imported_count=imported_count,
            replaced_future_count=replaced_future_count,
            matched_messages=matched_messages,
            scanned_messages=scanned_messages,
            errors=errors,
        )
