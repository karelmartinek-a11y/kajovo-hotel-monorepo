from datetime import UTC, date, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, update
from sqlalchemy.orm import Session

from app.api.routes import egg_orders as routes
from app.db.models import InventoryEggOrder
from app.db.session import get_db
from app.security.rbac import require_permission
from app.services.egg_orders import delivery_date


@pytest.mark.parametrize(("local", "expected"), [
    ("2026-11-14T19:00", "2026-11-16"),
    ("2026-11-14T11:00", "2026-11-16"),
    ("2026-11-10T01:00", "2026-11-11"),
    ("2026-11-10T20:00", "2026-11-12"),
    ("2026-11-13T18:00", "2026-11-14"),
    ("2026-11-13T18:00:01", "2026-11-16"),
    ("2026-07-07T18:00", "2026-07-08"),
    ("2026-07-07T18:01", "2026-07-09"),
])
def test_delivery_date(local, expected):
    now = datetime.fromisoformat(local).replace(tzinfo=ZoneInfo("Europe/Prague"))
    assert delivery_date(now.astimezone(UTC)) == date.fromisoformat(expected)


@pytest.fixture
def warehouse(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'orders.db'}")
    InventoryEggOrder.__table__.create(engine)
    app = FastAPI()

    @app.middleware("http")
    async def identity(request: Request, call_next):
        if user := request.headers.get("x-fixture-user"):
            request.state.cml_web_claims = {"sub": user, "nativeId": "synthetic"}
        return await call_next(request)

    def db():
        with Session(engine) as session:
            yield session

    def fake_permission():
        pass

    dependency = routes.router.dependencies[0].dependency
    assert require_permission("inventory", "write").__name__ == dependency.__name__
    app.dependency_overrides[dependency] = fake_permission
    app.dependency_overrides[get_db] = db
    app.include_router(routes.router)
    calls = []

    async def mail(_, payload):
        calls.append(payload)
        order_id = payload["send_intent_id"]
        with Session(engine) as session:
            order = session.get(InventoryEggOrder, order_id)
            assert order
            digest = order.content_hash
        return {"receipt": {
            "send_intent_id": order_id, "idempotency_key": order_id, "content_hash": digest,
            "smtp_state": "accepted", "operation_id": str(uuid4()),
            "accepted_recipient_addresses": ["supplier@example.invalid"],
        }}

    monkeypatch.setattr(routes.egg_orders, "mail_config", lambda: {"recipient": "supplier@example.invalid"})
    monkeypatch.setattr(routes.egg_orders, "call_mail", mail)
    with TestClient(app) as client:
        yield client, engine, calls
    engine.dispose()


def test_repeat_is_shared_and_confirmation_is_bound_to_last_order_and_date(warehouse):
    client, _, calls = warehouse
    path = "/api/v1/inventory/egg-orders"
    first = {"x-fixture-user": "first"}
    second = {"x-fixture-user": "second"}
    key = str(uuid4())
    assert client.post(path, json={"id": key}).status_code == 403
    sent = client.post(path, headers=first, json={"id": key}).json()
    assert sent["state"] == "sent"
    assert client.post(path, headers=first, json={"id": key}).json() == sent
    prompt = client.post(path, headers=second, json={"id": str(uuid4())}).json()
    assert prompt["state"] == "confirm"
    assert prompt["previous_id"] == key
    assert prompt["previous_delivery_date"] == sent["delivery_date"]
    assert datetime.fromisoformat(prompt["previous_sent_at"]).tzinfo is not None
    assert len(calls) == 1  # Closing the prompt makes no send.
    confirm = {"id": str(uuid4()), "confirmed_previous_id": key,
               "confirmed_delivery_date": "2020-01-01"}
    assert client.post(path, headers=second, json=confirm).json()["state"] == "confirm"
    confirm["confirmed_delivery_date"] = prompt["delivery_date"]
    assert client.post(path, headers=second, json=confirm).json()["state"] == "sent"
    confirm["id"] = str(uuid4())
    assert client.post(path, headers=second, json=confirm).json()["state"] == "confirm"
    assert len(calls) == 2


def test_24_hours_are_elapsed_time_and_not_calendar_days(warehouse):
    client, engine, calls = warehouse
    path = "/api/v1/inventory/egg-orders"
    user = {"x-fixture-user": "warehouse"}
    assert client.post(path, headers=user, json={"id": str(uuid4())}).json()["state"] == "sent"
    with Session(engine) as session:
        session.execute(update(InventoryEggOrder).values(sent_at=datetime.now(UTC)-timedelta(hours=24, seconds=1)))
        session.commit()
    assert client.post(path, headers=user, json={"id": str(uuid4())}).json()["state"] == "sent"
    assert len(calls) == 2


def test_unknown_order_checks_only_original_mail_receipt(warehouse, monkeypatch):
    client, _, calls = warehouse
    path = "/api/v1/inventory/egg-orders"
    user = {"x-fixture-user": "warehouse"}
    original = routes.egg_orders.call_mail

    async def lost(config, payload):
        if payload["kind"] == "send":
            calls.append(payload)
            raise TimeoutError()
        return await original(config, payload)

    monkeypatch.setattr(routes.egg_orders, "call_mail", lost)
    key = str(uuid4())
    assert client.post(path, headers=user, json={"id": key}).json()["state"] == "unknown"
    assert client.post(path, headers=user, json={"id": str(uuid4())}).json()["state"] == "busy"
    assert client.get(f"{path}/{key}", headers=user).json()["state"] == "sent"
    assert [(call["kind"], call["send_intent_id"]) for call in calls] == [("send", key), ("status", key)]
