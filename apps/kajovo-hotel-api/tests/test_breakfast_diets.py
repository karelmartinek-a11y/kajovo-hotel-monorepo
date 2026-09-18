from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.routes import breakfast
from app.api.schemas import BreakfastDietUpdate
from app.config import Settings
from app.db.models import AuditTrail, Base, BreakfastOrder, ReservationBreakfastDiet
from app.services.breakfast.diets import (
    change_diet,
    enrich_orders,
    ensure_diets,
    reservation_ids,
)
from app.services.breakfast.sync import (
    BetterHotelBreakfastAggregate,
    BetterHotelBreakfastClient,
    sync_breakfast_range,
)


@pytest.fixture
def db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'diets.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def actor(role="recepce"):
    request = Request({"type": "http"})
    request.state.actor_id = f"{role}@example.test"
    request.state.actor_role = role
    return request


def seed(db):
    ensure_diets(db, {"stay-a": {"arrival": date(2026, 9, 15), "departure": date(2026, 9, 18)}})
    for day in range(15, 19):
        db.add(BreakfastOrder(service_date=date(2026, 9, day), source_key=f"2026-09-{day}|stay-a",
                              room_number="101" if day < 17 else "102", guest_name="Host", guest_count=1))
    db.add(BreakfastOrder(service_date=date(2026, 9, 19), source_key="2026-09-19|stay-next",
                          room_number="102", guest_name="Další", guest_count=1))
    db.commit()
    return db.scalars(select(BreakfastOrder).order_by(BreakfastOrder.service_date)).all()


@pytest.mark.parametrize("kind", ["diet_no_gluten", "diet_no_milk", "diet_no_pork"])
def test_whole_stay_toggle_excludes_arrival_follows_room_and_does_not_leak(db, kind):
    rows = seed(db)
    change_diet(db, actor(), rows[2], "stay-a", kind=kind, enabled=True, version=1)
    assert [getattr(row, kind) for row in rows] == [False, True, True, True, False]
    with Session(db.bind) as fresh:
        assert getattr(fresh.get(ReservationBreakfastDiet, "stay-a"), kind) is True
    change_diet(db, actor("admin"), rows[3], "stay-a", kind=kind, enabled=False, version=2)
    assert not any(getattr(row, kind) for row in rows)
    assert len(db.scalars(select(AuditTrail).where(AuditTrail.action == "reservation_diet")).all()) == 2
    with pytest.raises(HTTPException) as conflict:
        change_diet(db, actor(), rows[1], "stay-a", kind=kind, enabled=True, version=2)
    assert conflict.value.status_code == 409


@pytest.mark.parametrize("role", ["snídaně", "pokojská", "údržba"])
def test_forbidden_roles_cannot_update_diet(db, role):
    order = seed(db)[1]
    with pytest.raises(HTTPException) as denied:
        change_diet(db, actor(role), order, "stay-a", kind="diet_no_milk", enabled=True, version=1)
    assert denied.value.status_code == 403


def test_merged_order_or_and_missing_identity(db):
    rows = seed(db)
    ensure_diets(db, {"stay-b": {}})
    rows[1].source_key += "|stay-b"
    db.commit()
    change_diet(db, actor(), rows[1], "stay-b", kind="diet_no_gluten", enabled=True, version=1)
    change_diet(db, actor(), rows[1], "stay-a", kind="diet_no_gluten", enabled=True, version=1)
    change_diet(db, actor(), rows[1], "stay-a", kind="diet_no_gluten", enabled=False, version=2)
    assert rows[1].diet_no_gluten is True
    assert rows[2].diet_no_gluten is False
    assert len(enrich_orders(db, [rows[1]])[0].reservations) == 2
    for source in [None, "2026-09-16|unknown", "2026-09-15|stay-a"]:
        rows[1].source_key = source
        with pytest.raises(HTTPException) as invalid:
            change_diet(db, actor(), rows[1], "stay-a", kind="diet_no_gluten", enabled=True, version=3)
        assert invalid.value.status_code == 409


def test_api_revalidates_reservation_and_version(db, monkeypatch):
    order = seed(db)[1]
    aggregate = BetterHotelBreakfastAggregate(order.service_date, order.source_key, order.room_number, 1, "Host",
        {"stay-a": {"arrival": date(2026, 9, 15), "departure": date(2026, 9, 18)}})
    monkeypatch.setattr(breakfast, "BetterHotelBreakfastClient", lambda settings: SimpleNamespace(
        build_aggregates=lambda **kwargs: ([aggregate], 1, "hash")))
    payload = BreakfastDietUpdate(kind="diet_no_milk", enabled=True, version=1)
    updated = breakfast.update_reservation_diet(order.id, "stay-a", payload, actor(), db)
    assert updated.diet_no_milk is True
    assert updated.reservations[0].version == 2
    with pytest.raises(HTTPException) as conflict:
        breakfast.update_reservation_diet(order.id, "stay-a", payload, actor(), db)
    assert conflict.value.status_code == 409
    monkeypatch.setattr(breakfast, "BetterHotelBreakfastClient", lambda settings: SimpleNamespace(
        build_aggregates=lambda **kwargs: ([], 0, "hash")))
    with pytest.raises(HTTPException) as moved:
        breakfast.update_reservation_diet(order.id, "stay-a", payload, actor(), db)
    assert moved.value.status_code == 409


def test_sync_projects_persisted_diets_into_new_days_and_preserves_disabled(db, monkeypatch):
    import app.services.breakfast.sync as sync
    order = seed(db)[1]
    change_diet(db, actor(), order, "stay-a", kind="diet_no_pork", enabled=True, version=1)
    day = date(2026, 9, 20)
    aggregate = BetterHotelBreakfastAggregate(day, "2026-09-20|stay-a", "303", 1, "Host",
        {"stay-a": {"arrival": date(2026, 9, 15), "departure": day}})
    monkeypatch.setattr(sync, "BetterHotelBreakfastClient", lambda settings: SimpleNamespace(
        is_configured=lambda: True, build_aggregates=lambda **kwargs: ([aggregate], 1, "hash")))
    sync_breakfast_range(db, settings=Settings(_env_file=None), range_start=day, range_end=day, trigger="test", note="")
    new_order = db.scalar(select(BreakfastOrder).where(BreakfastOrder.service_date == day))
    assert new_order.diet_no_pork is True
    change_diet(db, actor(), new_order, "stay-a", kind="diet_no_pork", enabled=False, version=2)
    sync_breakfast_range(db, settings=Settings(_env_file=None), range_start=day, range_end=day, trigger="test", note="")
    assert db.scalar(select(BreakfastOrder).where(BreakfastOrder.service_date == day)).diet_no_pork is False


def test_api_aggregation_breakfast_days_and_metadata(monkeypatch):
    client = BetterHotelBreakfastClient(Settings(_env_file=None))
    monkeypatch.setattr(client, "list_breakfast_reservations", lambda **kwargs: [{
        "id": "one", "arrival": "2026-09-17", "departure": "2026-09-18",
        "room": {"name": "101"}, "guest_list": [{"food": 1, "guest": {"first_name": "A", "last_name": "B"}}],
    }])
    rows, _, _ = client.build_aggregates(service_start=date(2026, 9, 17), service_end=date(2026, 9, 19))
    assert [row.service_date for row in rows] == [date(2026, 9, 18)]
    assert rows[0].reservations["one"]["arrival"] == date(2026, 9, 17)
    assert reservation_ids(rows[0].source_key, rows[0].service_date) == ["one"]


def test_migration_unifies_flags_and_preserves_unlinked_rows(tmp_path, caplog):
    import importlib.util
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text
    path = Path(__file__).parents[1] / "alembic/versions/0032_reservation_breakfast_diets.py"
    spec = importlib.util.spec_from_file_location("diet_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    BreakfastOrder.__table__.create(engine)
    with engine.begin() as connection:
        for day, source, gluten, milk in [(16, "2026-09-16|a", True, False),
                                           (17, "2026-09-17|a", False, True),
                                           (18, None, False, True)]:
            connection.execute(BreakfastOrder.__table__.insert().values(
                service_date=date(2026, 9, day), source_key=source, room_number="101", guest_name="Host",
                guest_count=1, diet_no_gluten=gluten, diet_no_milk=milk))
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        rows = connection.execute(text("SELECT diet_no_gluten, diet_no_milk FROM breakfast_orders ORDER BY service_date")).all()
        assert rows == [(1, 1), (1, 1), (0, 1)]
        assert connection.execute(text("SELECT version FROM reservation_breakfast_diets")).scalar() == 1
    assert "preserved_unlinked_orders=1" in caplog.text
    engine.dispose()
