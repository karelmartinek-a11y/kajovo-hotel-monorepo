from __future__ import annotations

import email
import json
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "kajovo-hotel-api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings
from app.db.models import Base, BreakfastOrder
from app.services.breakfast.mail_fetcher import BreakfastMailFetcher
from app.services.breakfast.scheduler import run_breakfast_scheduler_iteration

# Tento smoke script overuje scheduler pipeline a artefakty.
# Nepredstavuje dukaz realne IMAP integrace, protoze zamerne pouziva fake klient a synteticky payload.

class _FakeImapClient:
    def __init__(self, payload: bytes):
        self._payload = payload

    def select(self, _mailbox: str):
        return "OK", [b""]

    def search(self, *_args):
        return "OK", [b"1"]

    def fetch(self, _uid: bytes, _what: str):
        return "OK", [(b"RFC822", self._payload)]

    def logout(self):
        return "BYE", [b""]


def _build_email_with_pdf(pdf_payload: bytes) -> bytes:
    msg = email.message.EmailMessage()
    msg["From"] = "reports@better-hotel.com"
    msg["Subject"] = "Přehled stravy"
    msg.set_content("Attached.")
    msg.add_attachment(
        pdf_payload,
        maintype="application",
        subtype="pdf",
        filename="breakfast.pdf",
    )
    return msg.as_bytes()


def main() -> int:
    temp_root = ROOT / "artifacts" / "breakfast-runtime-smoke"
    media_dir = temp_root / "media"
    runtime_dir = temp_root / "runtime-artifacts"
    media_dir.mkdir(parents=True, exist_ok=True)
    runtime_dir.mkdir(parents=True, exist_ok=True)

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    target_day = date(2026, 3, 12)
    settings = Settings(
        breakfast_imap_host="imap.test.local",
        breakfast_imap_port=993,
        breakfast_imap_use_ssl=True,
        breakfast_imap_mailbox="INBOX",
        breakfast_imap_username="imap-user",
        breakfast_imap_password="imap-password",
        breakfast_imap_from_contains="better-hotel.com",
        breakfast_imap_subject_contains="Přehled stravy",
        media_root=str(media_dir),
        breakfast_runtime_artifact_dir=str(runtime_dir),
    )
    fetcher = BreakfastMailFetcher(settings)
    fetcher._connect = lambda: _FakeImapClient(_build_email_with_pdf(b"%PDF-1.4 fake"))  # type: ignore[method-assign]

    import app.services.breakfast.mail_fetcher as mail_fetcher_module
    import app.services.breakfast.scheduler as scheduler_module

    original_parse = mail_fetcher_module.parse_breakfast_pdf
    original_session_local = scheduler_module.SessionLocal
    original_get_settings = scheduler_module.get_settings

    try:
        mail_fetcher_module.parse_breakfast_pdf = lambda _payload: (  # type: ignore[assignment]
            target_day,
            [SimpleNamespace(room="101", guest_name="Novak", breakfast_count=2)],
        )
        scheduler_module.SessionLocal = lambda: Session(engine)  # type: ignore[assignment]
        scheduler_module.get_settings = lambda: settings  # type: ignore[assignment]

        result = run_breakfast_scheduler_iteration(fetcher=fetcher, target_day=target_day)
        artifact_path = runtime_dir / "breakfast-scheduler-latest.json"
        archived_pdf = media_dir / "breakfast" / "imports" / f"{target_day.isoformat()}-imap.pdf"
        with Session(engine) as db:
            rows = list(db.scalars(select(BreakfastOrder).where(BreakfastOrder.service_date == target_day)))
        if not result.ok or not artifact_path.exists() or not archived_pdf.exists() or len(rows) != 1:
            return 1
        payload = json.loads(artifact_path.read_text(encoding="utf-8"))
        if payload.get("service_date") != target_day.isoformat() or payload.get("ok") is not True:
            return 1

        print(f"Breakfast runtime smoke: PASS ({temp_root})")
        return 0
    finally:
        mail_fetcher_module.parse_breakfast_pdf = original_parse  # type: ignore[assignment]
        scheduler_module.SessionLocal = original_session_local  # type: ignore[assignment]
        scheduler_module.get_settings = original_get_settings  # type: ignore[assignment]
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
