import email
from datetime import date
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import Base, BreakfastOrder
from app.services.breakfast.mail_fetcher import BreakfastMailFetcher


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


def test_breakfast_imap_smoke_fetch_import(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "imap-smoke.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=engine)
    target_day = date(2026, 3, 12)
    fake_pdf = b"%PDF-1.4 fake"

    settings = Settings(
        breakfast_imap_host="imap.test.local",
        breakfast_imap_port=993,
        breakfast_imap_use_ssl=True,
        breakfast_imap_mailbox="INBOX",
        breakfast_imap_username="imap-user",
        breakfast_imap_password="imap-password",
        breakfast_imap_from_contains="better-hotel.com",
        breakfast_imap_subject_contains="Přehled stravy",
        media_root=str(tmp_path / "media"),
    )
    fetcher = BreakfastMailFetcher(settings)
    monkeypatch.setattr(
        fetcher,
        "_connect",
        lambda: _FakeImapClient(_build_email_with_pdf(fake_pdf)),
    )
    monkeypatch.setattr(
        "app.services.breakfast.mail_fetcher.parse_breakfast_pdf",
        lambda _payload: (
            target_day,
            [SimpleNamespace(room="101", guest_name="Novak", breakfast_count=2)],
        ),
    )

    with Session(engine) as db:
        imported = fetcher.fetch_and_store_for_day(db, target_day)
        assert imported is True
        rows = list(db.scalars(select(BreakfastOrder).where(BreakfastOrder.service_date == target_day)))
        assert len(rows) == 1
        assert rows[0].room_number == "101"
        assert rows[0].guest_count == 2

    archived = tmp_path / "media" / "breakfast" / "imports" / f"{target_day.isoformat()}-imap.pdf"
    assert archived.exists()
