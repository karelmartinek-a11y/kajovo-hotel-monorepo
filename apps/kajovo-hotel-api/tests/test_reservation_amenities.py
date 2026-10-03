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


@pytest.mark.parametrize('kind,quantity', [('dog', 5), ('cot', 1)])
def test_billed_requirement_confirmation_creates_green_persistent_version_without_reception(db, monkeypatch, kind, quantity):
    from app.api.schemas import ReservationAmenityKind, ReservationRequirementConfirm
    reservation = {'id': 'r', 'room': {'id': '101'}, 'bill': {'bill_item': [
        {'label': 'Domácí mazlíček', 'quantity': 2, 'is_open': False},
        {'label': 'Domácí mazlíček další noc', 'quantity': 3},
        {'label': 'Dětská postýlka', 'quantity': 4},
    ]}}
    def source(day, **kwargs):
        assert kwargs == {'include_options': True}
        return [reservation]
    monkeypatch.setattr(housekeeping, '_client', lambda: SimpleNamespace(reservations_for_day=source))
    result = housekeeping.confirm_reservation_requirement('r', ReservationAmenityKind(kind), ReservationRequirementConfirm(version=0, quantity=quantity), request('pokojská'), '101', date(2026, 10, 3), db)
    assert result == {'kind': kind, 'state': 'green', 'version': 1, 'active': True}
    with Session(db.bind) as fresh:
        assert fresh.scalar(select(ReservationAmenity)).state == 'green'
        assert fresh.scalar(select(AuditTrail)).action == 'confirm'
    with pytest.raises(HTTPException) as conflict:
        housekeeping.confirm_reservation_requirement('r', ReservationAmenityKind(kind), ReservationRequirementConfirm(version=0, quantity=quantity), request('pokojská'), '101', date(2026, 10, 3), db)
    assert conflict.value.status_code == 409


@pytest.mark.parametrize('reservation_id,room_id,bill,quantity,status', [
    ('missing', '101', {'bill_item': [{'label': 'Domácí mazlíček', 'quantity': 1}]}, 1, 409),
    ('r', '102', {'bill_item': [{'label': 'Domácí mazlíček', 'quantity': 1}]}, 1, 409),
    ('r', '101', None, 1, 409),
    ('r', '101', {'bill_item': [{'label': 'Domácí mazlíček', 'quantity': 1, 'archived': True}]}, 1, 409),
    ('r', '101', {'bill_item': [{'label': 'Domácí mazlíček', 'quantity': 2}]}, 1, 409),
    ('r', '101', 'unexpanded', 1, 502),
])
def test_confirmation_rejects_unverified_or_changed_request_without_creating_manual_icon(db, monkeypatch, reservation_id, room_id, bill, quantity, status):
    from app.api.schemas import ReservationAmenityKind, ReservationRequirementConfirm
    monkeypatch.setattr(housekeeping, '_client', lambda: SimpleNamespace(reservations_for_day=lambda *args, **kwargs: [{'id': 'r', 'room': {'id': '101'}, 'bill': bill}]))
    with pytest.raises(HTTPException) as error:
        housekeeping.confirm_reservation_requirement(reservation_id, ReservationAmenityKind.DOG, ReservationRequirementConfirm(version=0, quantity=quantity), request('pokojská'), room_id, date(2026, 10, 3), db)
    assert error.value.status_code == status
    assert db.scalar(select(ReservationAmenity)) is None


def test_confirmation_reactivates_native_removed_marker_only_with_current_version(db):
    change_amenity(db, request('recepce'), 'r', 'cot', operation='add', version=0)
    change_amenity(db, request('recepce'), 'r', 'cot', operation='remove', version=1)
    result = change_amenity(db, request('pokojská'), 'r', 'cot', operation='confirm', version=2)
    assert result == {'kind': 'cot', 'state': 'green', 'version': 3, 'active': True}
    with pytest.raises(HTTPException) as error:
        change_amenity(db, request('sklad'), 'other', 'cot', operation='confirm', version=0)
    assert error.value.status_code == 403


def test_confirmation_http_contract_persists_and_isolates_other_reservation(db, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.db.session import get_db
    from sqlalchemy import select
    app = FastAPI()
    app.add_api_route('/reservations/{reservation_id}/requirements/{kind}/confirm', housekeeping.confirm_reservation_requirement, methods=['POST'])
    app.dependency_overrides[get_db] = lambda: db
    @app.middleware('http')
    async def identity(http_request, call_next):
        http_request.state.actor_role = 'pokojská'
        http_request.state.actor_id = 'maid@example.test'
        return await call_next(http_request)
    monkeypatch.setattr(housekeeping, '_client', lambda: SimpleNamespace(reservations_for_day=lambda *args, **kwargs: [{'id': 'r', 'room': {'id': '101'}, 'bill': {'bill_item': [{'label': 'Dětská postýlka', 'quantity': 2}]}}]))
    client = TestClient(app)
    response = client.post('/reservations/r/requirements/cot/confirm?room_id=101&date=2026-10-03', json={'version': 0, 'quantity': 1})
    assert response.status_code == 200 and response.json()['state'] == 'green'
    overview = enrich_overview(db, {'rooms': [{'room_id': '101', 'departures': [{'reservation_id': 'old'}], 'arrivals': [{'reservation_id': 'r'}], 'stays': []}]})
    assert overview['rooms'][0]['arrivals'][0]['amenities'][0]['state'] == 'green'
    assert overview['rooms'][0]['departures'][0]['amenities'] == []
    assert len(db.scalars(select(ReservationAmenity)).all()) == 1
    assert client.post('/reservations/r/requirements/cot/confirm?room_id=101&date=2026-10-03', json={'version': -1, 'quantity': 0}).status_code == 422


def test_concurrent_confirmations_accept_one_expected_version_only(db):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    change_amenity(db, request('recepce'), 'r', 'dog', operation='add', version=0)
    barrier = Barrier(2)
    def confirm():
        with Session(db.bind) as concurrent:
            barrier.wait(timeout=5)
            try:
                return change_amenity(concurrent, request('pokojská'), 'r', 'dog', operation='confirm', version=1)['version']
            except HTTPException as error:
                return error.status_code
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: confirm(), range(2)))
    assert sorted(results) == [2, 409]
    with Session(db.bind) as fresh:
        row = fresh.scalar(select(ReservationAmenity))
        assert row.state == 'green' and row.version == 2
