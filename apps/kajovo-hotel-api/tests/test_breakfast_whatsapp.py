import asyncio
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.api.routes.breakfast_whatsapp import BreakfastWhatsappUpdate
from app.db.models import Base, BreakfastOrder
from app.db.models import BreakfastWhatsappDelivery as Delivery
from app.db.models import BreakfastWhatsappRun as Run
from app.db.models import BreakfastWhatsappSettings as Schedule
from app.services.breakfast import whatsapp
from app.services.breakfast.whatsapp_client import NotificationUnavailable

NOW = datetime(2026, 11, 3, 17, 0, tzinfo=timezone.utc)  # 18:00 Prague
NUMBERS = ["+420111222333", "+420444555666"]


@pytest.fixture
def factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'notification.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    engine.dispose()


def enable(factory, now=NOW):
    with factory() as db:
        db.add(Schedule(id=1, enabled=True, send_time="18:00", recipients=NUMBERS,
                        revision=1, next_run_at=now))
        db.commit()


class FakeClient:
    def __init__(self):
        self.sent = []
        self.receipts = {}
        self.ready = True
        self.timeout = False

    async def readiness(self, number):
        return {"ready": self.ready, "error_code": "TEMPLATE_NOT_APPROVED"}

    async def send(self, ident, number, text):
        self.sent.append((ident, number, text))
        self.receipts[ident] = {"id": ident, "state": "pending"}
        if self.timeout:
            raise TimeoutError("private provider data")
        return self.receipts[ident]

    async def status(self, ident):
        if ident not in self.receipts:
            raise NotificationUnavailable("NOT_FOUND")
        return self.receipts[ident]


def tick(factory, client, now=NOW, fetch=lambda db, day: 23):
    asyncio.run(whatsapp.notification_iteration(factory=factory, client=client, now=now, fetch=fetch))


@pytest.mark.parametrize(("raw", "expected"), [
    (["+420 111 222 333", "00420111222333"], [NUMBERS[0]]),
    (["+420111222333", "+421444555666"], [NUMBERS[0], "+421444555666"]),
])
def test_phone_normalization_and_deduplication(raw, expected):
    value = BreakfastWhatsappUpdate(enabled=True, send_time="07:05", recipients=raw, revision=0)
    assert value.recipients == expected


@pytest.mark.parametrize("patch", [
    {"recipients": ["111222333"]}, {"recipients": ["+٤٢٠١١١٢٢٢٣٣٣"]},
    {"recipients": []}, {"send_time": "24:00"}, {"send_time": "7:00"},
    {"recipients": NUMBERS * 11}, {"enabled": "true"}, {"revision": -1},
])
def test_invalid_configuration_is_rejected(patch):
    with pytest.raises(ValidationError):
        BreakfastWhatsappUpdate(**{"enabled": True, "send_time": "18:00", "recipients": NUMBERS, "revision": 0, **patch})


def test_dst_and_date_boundaries():
    assert whatsapp.scheduled_time(date(2027, 3, 28), "02:30").isoformat() == "2027-03-28T01:00:00+00:00"
    assert whatsapp.scheduled_time(date(2026, 10, 25), "02:30").isoformat() == "2026-10-25T00:30:00+00:00"
    assert whatsapp.next_occurrence("18:00", NOW) == NOW + timedelta(days=1)
    assert whatsapp.next_occurrence("00:05", datetime(2026, 12, 31, 23, 0, tzinfo=timezone.utc)).isoformat() == "2026-12-31T23:05:00+00:00"


def test_one_daily_batch_counts_people_and_queued_receipts_do_not_resend(factory):
    enable(factory)
    client = FakeClient()
    dates = []
    def fetch(db, day):
        dates.append(day)
        return 23
    tick(factory, client, fetch=fetch)
    tick(factory, client, now=NOW + timedelta(minutes=1), fetch=fetch)
    assert dates == [date(2026, 11, 4)]
    assert len(client.sent) == 2
    assert client.sent[0][2] == "KájovoHotel: Na zítra 04. 11. 2026 je v plánu 23 snídaní."
    with factory() as db:
        assert len(list(db.scalars(select(Run)))) == 1
        assert {d.state for d in db.scalars(select(Delivery))} == {"queued"}


def test_verified_zero_is_sent(factory):
    enable(factory)
    client = FakeClient()
    tick(factory, client, fetch=lambda db, day: 0)
    assert len(client.sent) == 2
    assert " 0 snídaní." in client.sent[0][2]


def test_disabled_before_due_or_missing_schedule_never_sends(factory):
    client = FakeClient()
    tick(factory, client)
    enable(factory)
    tick(factory, client, now=NOW - timedelta(seconds=1))
    with factory() as db:
        db.get(Schedule, 1).enabled = False
        db.commit()
    tick(factory, client)
    assert client.sent == []


def test_late_restart_does_not_send_yesterdays_summary(factory):
    enable(factory, now=NOW - timedelta(days=2))
    client = FakeClient()
    tick(factory, client)
    assert client.sent == []
    with factory() as db:
        assert db.scalar(select(Run)) is None
        assert whatsapp.aware(db.get(Schedule, 1).next_run_at) > NOW


def test_data_failure_is_not_zero_and_safe_read_retries(factory):
    enable(factory)
    client = FakeClient()
    def fail(db, day):
        raise ValueError("private provider body")
    tick(factory, client, fetch=fail)
    with factory() as db:
        run = db.scalar(select(Run))
        assert run.breakfast_count is None
        assert run.error_code == "BREAKFAST_DATA_UNAVAILABLE"
    assert client.sent == []
    tick(factory, client, now=NOW + timedelta(minutes=2))
    assert len(client.sent) == 2


def test_template_unavailable_blocks_without_queueing(factory):
    enable(factory)
    client = FakeClient()
    client.ready = False
    tick(factory, client)
    assert client.sent == []
    with factory() as db:
        assert {d.error_code for d in db.scalars(select(Delivery))} == {"TEMPLATE_NOT_APPROVED"}
    client.ready = True
    tick(factory, client, now=NOW + timedelta(minutes=1))
    assert len(client.sent) == 2


def test_timeout_recovery_uses_original_receipts_never_resends(factory):
    enable(factory)
    client = FakeClient()
    client.timeout = True
    tick(factory, client)
    assert len(client.sent) == 2
    for ident in client.receipts:
        client.receipts[ident] = {"id": ident, "state": "delivered", "provider_message_id": "test-provider-id"}
    tick(factory, client, now=NOW + timedelta(minutes=1))
    assert len(client.sent) == 2
    with factory() as db:
        assert {d.state for d in db.scalars(select(Delivery))} == {"delivered"}


def test_unknown_not_found_never_creates_another_send(factory):
    enable(factory)
    client = FakeClient()
    tick(factory, client)
    with factory() as db:
        for d in db.scalars(select(Delivery)):
            d.state = "submitting"
        db.commit()
    client.receipts.clear()
    tick(factory, client, now=NOW + timedelta(minutes=1))
    assert len(client.sent) == 2


def test_pending_send_is_cancelled_on_settings_change(factory):
    enable(factory)
    client = FakeClient()
    client.ready = False
    tick(factory, client)
    with factory() as db:
        db.get(Schedule, 1).revision += 1
        db.commit()
    client.ready = True
    tick(factory, client)
    assert client.sent == []
    with factory() as db:
        assert {d.state for d in db.scalars(select(Delivery))} == {"cancelled"}


def test_parallel_workers_admit_only_one_send_per_recipient(factory):
    enable(factory)
    client = FakeClient()
    async def run():
        await asyncio.gather(*[whatsapp.notification_iteration(
            factory=factory, client=client, now=NOW, fetch=lambda db, day: 7,
        ) for _ in range(3)])
    asyncio.run(run())
    assert len(client.sent) == 2
    assert len({item[0] for item in client.sent}) == 2


def test_plan_uses_fresh_provider_people_and_excludes_cancelled_stays(factory, monkeypatch):
    day = date(2026, 11, 4)
    with factory() as db:
        db.add(BreakfastOrder(service_date=day, source_key="cancelled-stay", room_number="test",
                              guest_name="synthetic", guest_count=5, status="cancelled"))
        db.commit()
        monkeypatch.setattr(whatsapp.BetterHotelBreakfastClient, "build_aggregates", lambda *a, **kw: ([
            SimpleNamespace(service_date=day, source_key="active-stay", guest_count=3),
            SimpleNamespace(service_date=day, source_key="cancelled-stay", guest_count=5),
        ], 2, "synthetic-hash"))
        assert whatsapp.fetch_plan(db, day) == 3


def test_admin_api_defaults_validation_revision_and_member_denial(api_request, api_base_url):
    import httpx
    path = "/api/v1/admin/settings/breakfast-whatsapp"
    with httpx.Client(base_url=api_base_url) as anonymous:
        assert anonymous.get(path).status_code in {401, 403}
        assert anonymous.put(path, json={}).status_code in {401, 403}
    status, data = api_request(path)
    assert status == 200 and data["enabled"] is False and data["recipients"] == []
    payload = {"enabled": False, "send_time": "09:05", "recipients": NUMBERS, "revision": data["revision"]}
    status, saved = api_request(path, method="PUT", payload=payload)
    assert status == 200 and saved["send_time"] == "09:05"
    assert api_request(path, method="PUT", payload=payload)[0] == 409
    assert api_request(path, method="PUT", payload={**payload, "send_time": "25:00"})[0] == 422
    with httpx.Client(base_url=api_base_url) as member:
        login = member.post("/api/auth/login", json={"email": "snidane@example.com", "password": "snidane-pass"})
        assert login.status_code == 200
        assert member.get(path).status_code == 403
