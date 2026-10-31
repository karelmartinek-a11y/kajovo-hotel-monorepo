"""Actual Hotel routers with isolated synthetic state and no external network."""


def build_fixture():
    import os

    if os.getenv("HOTEL_CML_UI_QUALIFICATION") != "1":
        raise RuntimeError("Explicit isolated qualification required")
    import socket
    import tempfile
    from datetime import datetime, timedelta
    from pathlib import Path
    from zoneinfo import ZoneInfo

    from fastapi import FastAPI
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker

    _private = tempfile.TemporaryDirectory(prefix="cml-hotel-fixture-")
    os.environ["KAJOVO_API_MEDIA_ROOT"] = _private.name
    os.environ["KAJOVO_API_SMTP_ENABLED"] = "false"
    os.environ["KAJOVO_API_BREAKFAST_SCHEDULER_ENABLED"] = "false"
    _connect = socket.socket.connect

    def connect_local_only(sock, address):
        if not isinstance(address, tuple) or address[0] not in {"127.0.0.1", "::1", "localhost"}:
            raise RuntimeError("External network prohibited in Hotel qualification")
        return _connect(sock, address)

    socket.socket.connect = connect_local_only
    from app.api.routes import (
        breakfast,
        chat,
        housekeeping,
        inventory,
        issues,
        lost_found,
        reports,
        settings,
        users,
    )
    from app.config import Settings
    from app.db.models import (
        AdminProfile,
        Base,
        BreakfastOrder,
        InventoryItem,
        Issue,
        LostFoundItem,
        PortalUser,
        PortalUserRole,
        Report,
    )
    from app.db.session import get_db
    from app.security.cml_web import CmlWebBoundary
    from app.services.cml_identity import resolve_identity
    from app.services.housekeeping import STATUS_NAMES, BetterHotelHousekeepingClient

    engine = create_engine(
        "sqlite:///" + _private.name + "/state.db", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    today = datetime.now(ZoneInfo("Europe/Prague")).date()
    with factory() as db:
        db.add_all(
            [
                AdminProfile(
                    id=1,
                    email="owner@example.invalid",
                    password_hash="synthetic-unused",
                    display_name="karmar78",
                ),
                PortalUser(
                    id=1,
                    first_name="Testovací",
                    last_name="Zaměstnanec",
                    email="attendance@example.invalid",
                    password_hash="synthetic-unused",
                    is_active=True,
                    roles=[PortalUserRole(role="recepce"), PortalUserRole(role="sklad")],
                ),
                PortalUser(
                    id=2,
                    first_name="Jiný",
                    last_name="Účet",
                    email="unrelated@example.invalid",
                    password_hash="synthetic-unused",
                    is_active=False,
                    roles=[PortalUserRole(role="sklad")],
                ),
                PortalUser(
                    id=3,
                    first_name="Testovací",
                    last_name="Pokojská",
                    email="housekeeper@example.invalid",
                    password_hash="synthetic-unused",
                    is_active=True,
                    roles=[PortalUserRole(role="pokojská")],
                ),
                BreakfastOrder(
                    id=1,
                    service_date=today,
                    room_number="101",
                    guest_name="Syntetický host",
                    guest_count=2,
                    status="pending",
                ),
                Issue(
                    id=1,
                    title="Syntetická závada",
                    location="Lobby",
                    priority="medium",
                    status="new",
                ),
                Report(
                    id=1,
                    title="Syntetické hlášení",
                    description="Izolovaná zkušební data",
                    status="open",
                ),
                InventoryItem(
                    id=1,
                    name="Syntetická skladová položka",
                    unit="ks",
                    min_stock=2,
                    current_stock=10,
                    amount_per_piece_base=1,
                ),
                LostFoundItem(
                    id=1,
                    item_type="found",
                    description="Syntetický nález",
                    category="Ostatní",
                    location="Lobby",
                    event_at=datetime.now(ZoneInfo("Europe/Prague")),
                    status="new",
                ),
            ]
        )
        db.commit()

    class SyntheticProvider(BetterHotelHousekeepingClient):
        def __init__(self):
            super().__init__(Settings(_env_file=None))
            self.states = {"room-101": "dirty", "room-102": "clean", "room-103": "stay_no_linen"}
            self.writes = 0

        def list_current_rooms(self):
            return [
                {
                    "room_id": ident,
                    "room_name": ident.removeprefix("room-") + " KOMFORT",
                    "room_status_id": state + "-id",
                    "room_status": {
                        "id": state + "-id",
                        "name": STATUS_NAMES[state],
                        "color": "#F57621",
                    },
                }
                for ident, state in self.states.items()
            ]

        def list_room_statuses(self):
            return [{"id": state + "-id", "name": name} for state, name in STATUS_NAMES.items()]

        def blocks_for_day(self, day):
            return []

        def list_reservations(self, day, *, range_type, state):
            if state != "confirmed" or range_type != "intersect":
                return []
            return [
                {
                    "id": "synthetic-stay-101",
                    "arrival": (day - timedelta(days=1)).isoformat(),
                    "departure": (day + timedelta(days=1)).isoformat(),
                    "label": "Syntetický pobyt",
                    "persons": 2,
                    "room": {"id": "room-101", "name": "101 KOMFORT"},
                    "reservation_status": {"name": "Check-in"},
                    "reservation_action": [
                        {"checkedin": day.isoformat() + "T08:00:00+00:00", "checkedout": None}
                    ],
                    "reservation_note": [{"housekeep": "Syntetická poznámka pro pokojskou"}],
                }
            ]

        def _request_json(self, path, *, method="GET", query=None, body=None):
            if method != "PATCH" or not path.startswith("/room-current-status/"):
                raise AssertionError("Unexpected synthetic provider call")
            ident = path.rsplit("/", 1)[1]
            assert ident in self.states
            self.states[ident] = body["room_status_id"].removesuffix("-id")
            self.writes += 1
            return {"data": [], "meta": {"action": "updated"}}

    provider = SyntheticProvider()
    housekeeping._client = lambda: provider

    def no_outbound_mail(*_args, **_kwargs):
        raise RuntimeError("Real SMTP prohibited in Hotel qualification")

    settings.build_email_service = no_outbound_mail
    users.build_email_service = no_outbound_mail
    app = FastAPI()
    for module in [
        users,
        housekeeping,
        breakfast,
        reports,
        issues,
        inventory,
        lost_found,
        chat,
        settings,
    ]:
        app.include_router(module.router)

    def dependency():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = dependency
    app.add_middleware(
        CmlWebBoundary,
        audience="hotel",
        session_factory=factory,
        resolve_identity=resolve_identity,
        ui_root=Path(__file__).resolve().parents[1] / "app/web_ui",
    )

    @app.get("/__fixture/readback")
    def readback():
        with factory() as db:
            return {
                "provider_writes": provider.writes,
                "room_states": dict(provider.states),
                "reports": [
                    {"id": r.id, "title": r.title, "status": r.status}
                    for r in db.scalars(select(Report))
                ],
                "inventory": [
                    {"id": r.id, "name": r.name, "stock": r.current_stock}
                    for r in db.scalars(select(InventoryItem))
                ],
                "breakfast": [
                    {"id": r.id, "status": r.status} for r in db.scalars(select(BreakfastOrder))
                ],
            }

    app.state.fixture_directory = _private
    return app


app = build_fixture()
