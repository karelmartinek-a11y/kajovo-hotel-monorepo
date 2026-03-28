from __future__ import annotations

import email
import imaplib
import logging
import os
from datetime import date, timedelta
from email.message import Message
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import BreakfastOrder, BreakfastStatus
from app.services.breakfast.parser import parse_breakfast_pdf

log = logging.getLogger("kajovo.breakfast.mail_fetcher")


def _decode_header_value(value: str | None) -> str:
    if not value:
        return ""
    parts = email.header.decode_header(value)
    out: list[str] = []
    for part, encoding in parts:
        if isinstance(part, bytes):
            out.append(part.decode(encoding or "utf-8", errors="replace"))
        else:
            out.append(str(part))
    return "".join(out).strip()


def _iter_pdf_attachments(msg: Message) -> list[tuple[str, bytes]]:
    out: list[tuple[str, bytes]] = []

    def _extract(part: Message) -> None:
        ctype = (part.get_content_type() or "").lower()
        filename = _decode_header_value(part.get_filename() or "")
        is_pdf = filename.lower().endswith(".pdf") if filename else ctype == "application/pdf"
        if not is_pdf:
            return
        payload = part.get_payload(decode=True)
        if isinstance(payload, (bytes, bytearray)):
            out.append((filename or "attachment.pdf", bytes(payload)))

    if msg.is_multipart():
        for part in msg.walk():
            if part.is_multipart():
                continue
            _extract(part)
    else:
        _extract(msg)
    return out


def _match_message(msg: Message, from_contains: str, subject_contains: str) -> bool:
    from_header = _decode_header_value(msg.get("From")).lower()
    subject = _decode_header_value(msg.get("Subject")).lower()
    if from_contains and from_contains.lower() not in from_header:
        return False
    if subject_contains and subject_contains.lower() not in subject:
        return False
    return True


def _imap_date(value: date) -> str:
    return value.strftime("%d-%b-%Y")


class BreakfastMailFetcher:
    def __init__(self, settings: Settings):
        self.settings = settings

    def validate_configuration(self) -> list[str]:
        missing: list[str] = []
        required_fields = {
            "breakfast_imap_host": self.settings.breakfast_imap_host,
            "breakfast_imap_username": self.settings.breakfast_imap_username,
            "breakfast_imap_password": self.settings.breakfast_imap_password,
        }
        for field_name, value in required_fields.items():
            if not str(value).strip():
                missing.append(field_name)
        return missing

    def _connect(self) -> imaplib.IMAP4:
        if self.settings.breakfast_imap_use_ssl:
            client = imaplib.IMAP4_SSL(
                self.settings.breakfast_imap_host, self.settings.breakfast_imap_port
            )
        else:
            client = imaplib.IMAP4(
                self.settings.breakfast_imap_host, self.settings.breakfast_imap_port
            )
        client.login(self.settings.breakfast_imap_username, self.settings.breakfast_imap_password)
        return client

    def fetch_and_store_for_day(self, db: Session, day: date) -> bool:
        missing = self.validate_configuration()
        if missing:
            log.warning(
                "Breakfast IMAP import skipped due to missing configuration",
                extra={"context": {"day": day.isoformat(), "missing": missing}},
            )
            return False

        try:
            client = self._connect()
        except imaplib.IMAP4.error:
            log.exception("Breakfast IMAP login failed for %s", day.isoformat())
            return False
        except OSError:
            log.exception("Breakfast IMAP connection failed for %s", day.isoformat())
            return False

        try:
            typ, _ = client.select(self.settings.breakfast_imap_mailbox)
            if typ != "OK":
                log.warning("Breakfast IMAP mailbox select failed for %s", day.isoformat())
                return False

            since = _imap_date(day)
            before = _imap_date(day + timedelta(days=1))
            typ, data = client.search(None, "SINCE", since, "BEFORE", before)
            if typ != "OK" or not data:
                log.warning("Breakfast IMAP search failed for %s", day.isoformat())
                return False
            uids = data[0].split()
            for uid in reversed(uids):
                typ, parts = client.fetch(uid, "(RFC822)")
                if typ != "OK" or not parts:
                    log.warning(
                        "Breakfast IMAP fetch failed for uid=%s",
                        uid.decode("utf-8", "ignore"),
                    )
                    continue
                raw = parts[0][1] if isinstance(parts[0], tuple) else b""
                if not raw:
                    continue
                msg = email.message_from_bytes(raw)
                if not _match_message(
                    msg,
                    self.settings.breakfast_imap_from_contains,
                    self.settings.breakfast_imap_subject_contains,
                ):
                    continue
                attachments = _iter_pdf_attachments(msg)
                for _, pdf_bytes in attachments:
                    try:
                        parsed_day, rows = parse_breakfast_pdf(pdf_bytes)
                    except ValueError:
                        log.warning(
                            "Breakfast IMAP attachment is not a valid breakfast PDF",
                            extra={"context": {"day": day.isoformat()}},
                        )
                        continue
                    if parsed_day != day:
                        continue
                    db.query(BreakfastOrder).filter(BreakfastOrder.service_date == parsed_day).delete(
                        synchronize_session=False
                    )
                    for row in rows:
                        db.add(
                            BreakfastOrder(
                                service_date=parsed_day,
                                room_number=row.room,
                                guest_name=row.guest_name or f"Pokoj {row.room}",
                                guest_count=max(1, int(row.breakfast_count)),
                                status=BreakfastStatus.PENDING.value,
                                note="Import IMAP",
                            )
                        )
                    archive_dir = Path(self.settings.media_root) / "breakfast" / "imports"
                    os.makedirs(archive_dir, exist_ok=True)
                    (archive_dir / f"{parsed_day.isoformat()}-imap.pdf").write_bytes(pdf_bytes)
                    db.commit()
                    log.info("Breakfast IMAP import completed for %s", parsed_day.isoformat())
                    return True
            log.info("Breakfast IMAP finished without matching PDF for %s", day.isoformat())
            return False
        finally:
            try:
                client.logout()
            except Exception:
                pass
