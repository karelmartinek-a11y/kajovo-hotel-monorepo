from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.api.routes import housekeeping
from app.db.models import AuditTrail, Base, ReservationAmenity
from app.services.reservation_amenities import change_amenity, enrich_overview


@pytest.fixture
def db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'amenities.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def request(role):
    result = Request({"type": "http"})
    result.state.actor_role = role
    result.state.actor_id = f"{role}@example.test"
    result.state.request_id = "amenity-test"
    return result


def test_amenity_lifecycle_roles_versions_audit_and_persistence(db):
    reception = request("recepce")
    maid = request("pokojská")
    first = change_amenity(db, reception, "stay-a", "cot", operation="add", version=0)
    assert first == {"kind": "cot", "state": "red", "version": 1, "active": True}
    green = change_amenity(db, maid, "stay-a", "cot", operation="color", version=1, state="green")
    assert green["state"] == "green"
    with pytest.raises(HTTPException) as conflict:
        change_amenity(db, reception, "stay-a", "cot", operation="color", version=1)
    assert conflict.value.status_code == 409
    for operation in ("add", "remove"):
        with pytest.raises(HTTPException) as denied:
            change_amenity(db, maid, "stay-a", "cot", operation=operation, version=2)
        assert denied.value.status_code == 403
    deleted = change_amenity(db, reception, "stay-a", "cot", operation="remove", version=2)
    assert deleted["active"] is False
    with pytest.raises(HTTPException):
        change_amenity(db, maid, "stay-a", "cot", operation="color", version=2, state="green")
    added = change_amenity(db, request("admin"), "stay-a", "cot", operation="add", version=3)
    assert added["state"] == "red" and added["version"] == 4
    with Session(db.bind) as fresh:
        row = fresh.scalar(select(ReservationAmenity))
        assert row.version == 4
        assert len(fresh.scalars(select(AuditTrail)).all()) == 4


def test_icons_follow_reservation_not_room_or_date(db):
    change_amenity(db, request("recepce"), "stay-a", "dog", operation="add", version=0)
    change_amenity(db, request("pokojská"), "stay-a", "dog", operation="color", version=1, state="green")
    for room_id, group in [("101", "arrivals"), ("102", "stays"), ("102", "departures")]:
        room = {"room_id": room_id, "arrivals": [], "departures": [], "stays": []}
        room[group] = [{"reservation_id": "stay-a"}]
        room["arrivals"].append({"reservation_id": "new-stay"})
        result = enrich_overview(db, {"rooms": [room]})
        target = next(stay for stay in result["rooms"][0][group] if stay["reservation_id"] == "stay-a")
        assert target["amenities"][0]["state"] == "green"
        assert room["arrivals"][-1]["amenities"] == []


def test_creation_conflict_and_absent_icon_cannot_be_colored(db):
    change_amenity(db, request("recepce"), "r", "dog", operation="add", version=0)
    for kind, operation in [("dog", "add"), ("cot", "color")]:
        with pytest.raises(HTTPException) as conflict:
            change_amenity(db, request("recepce"), "r", kind, operation=operation, version=0)
        assert conflict.value.status_code == 409


def test_reservation_validation_rejects_empty_or_moved_room(monkeypatch):
    monkeypatch.setattr(housekeeping, "_client", lambda: SimpleNamespace(reservations_for_day=lambda day: [{"id": "r", "room": {"id": "102"}}]))
    housekeeping._verify_reservation("r", "102", date(2026, 9, 17))
    for reservation_id, room_id in [("r", "101"), ("missing", "102")]:
        with pytest.raises(HTTPException) as conflict:
            housekeeping._verify_reservation(reservation_id, room_id, date(2026, 9, 17))
        assert conflict.value.status_code == 409
