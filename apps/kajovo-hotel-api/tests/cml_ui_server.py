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
    os.environ["KAJOVO_API_FIREBASE_SERVICE_ACCOUNT_JSON_B64"] = ""
    # Config-only browser qualification: no outbox worker runs in this fixture,
    # and the socket guard below rejects every external provider connection.
    push_public = os.getenv("HOTEL_CML_UI_PUSH_PUBLIC_KEY", "")
    os.environ["KAJOVO_API_WEB_PUSH_VAPID_PRIVATE_KEY"] = "synthetic-unused" if push_public else ""
    os.environ["KAJOVO_API_WEB_PUSH_VAPID_PUBLIC_KEY"] = push_public
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
        ChatParticipant,
        ChatConversation,
        ChatMessage,
        ChatPushOutbox,
        ChatPushSubscription,
        InventoryItem,
        InventoryCard,
        InventoryMovement,
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

    with factory() as db:
        owner = ChatParticipant(principal_type="admin_profile", principal_id=1,
                                email="owner@example.invalid", display_name="karmar78", is_active=True)
        employee = ChatParticipant(principal_type="portal", principal_id=1,
                                   email="attendance@example.invalid", display_name="Testovací Zaměstnanec", is_active=True)
        db.add_all([owner, employee])
        db.flush()
        conversation = ChatConversation(participant_low_id=min(owner.id, employee.id),
                                        participant_high_id=max(owner.id, employee.id))
        db.add(conversation)
        db.flush()
        for index in range(1, 62):
            db.add(ChatMessage(conversation_id=conversation.id,
                               sender_id=employee.id if index < 61 else owner.id,
                               body="Syntetická historická zpráva " + str(index),
                               client_message_id="synthetic-history-" + str(index),
                               sent_at=datetime.now(ZoneInfo("UTC"))-timedelta(minutes=62-index)))
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

    from app.services.breakfast.diets import ensure_diets
    from app.services.breakfast.sync import BetterHotelBreakfastAggregate

    reservation_id = "synthetic-stay-101"
    metadata = {
        reservation_id: {
            "guest_name": "Syntetický host",
            "arrival": today - timedelta(days=1),
            "departure": today + timedelta(days=1),
        }
    }
    with factory() as db:
        ensure_diets(db, metadata)
        order = db.get(BreakfastOrder, 1)
        order.source_key = today.isoformat() + "|" + reservation_id
        db.add(
            BreakfastOrder(
                id=2,
                service_date=today + timedelta(days=1),
                source_key=(today + timedelta(days=1)).isoformat() + "|" + reservation_id,
                room_number="101",
                guest_name="Syntetický host",
                guest_count=1,
                status="pending",
            )
        )
        db.commit()

    class SyntheticBreakfast:
        def __init__(self, _settings):
            pass

        def build_aggregates(self, *, service_start, service_end):
            return (
                [
                    BetterHotelBreakfastAggregate(
                        service_date=service_start,
                        source_key=service_start.isoformat() + "|" + reservation_id,
                        room_number="101",
                        guest_count=2,
                        guest_name="Syntetický host",
                        reservations=metadata,
                    )
                ],
                1,
                0,
            )

    breakfast.BetterHotelBreakfastClient = SyntheticBreakfast

    provider = SyntheticProvider()
    housekeeping._client = lambda: provider

    def no_outbound_mail(*_args, **_kwargs):
        raise RuntimeError("Real SMTP prohibited in Hotel qualification")

    settings.build_email_service = no_outbound_mail
    users.build_email_service = no_outbound_mail
    exports = []
    fixture_errors = []

    class ObservePdf:
        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            import hashlib

            digest = hashlib.sha256()
            size = 0
            pdf = False

            async def observed(message):
                nonlocal size, pdf
                if message["type"] == "http.response.start":
                    pdf = (
                        dict(message.get("headers", []))
                        .get(b"content-type", b"")
                        .startswith(b"application/pdf")
                    )
                if message["type"] == "http.response.body" and pdf:
                    content = message.get("body", b"")
                    digest.update(content)
                    size += len(content)
                await send(message)

            try:
                await self.app(scope, receive, observed)
            except Exception as exc:
                fixture_errors.append(type(exc).__name__)
                raise
            if pdf:
                exports.append({"path": scope["path"], "sha256": digest.hexdigest(), "bytes": size})

    app = FastAPI()
    app.add_middleware(ObservePdf)
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

    photo_fault = {"armed": False, "dropped": 0}

    class DropPhotoReply:
        """Lose only the ACK after the real multipart request and receipt commit.

        Browser interception may replay WebKit file streams as empty files. This
        fault leaves the actual browser upload untouched and loses the response
        outside CmlWebBoundary, after its durable response has been recorded.
        """

        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            target = (scope["type"] == "http" and scope["method"] == "POST"
                      and scope["path"].startswith(("/cml-web/api/v1/reports/", "/cml-web/api/v1/issues/", "/cml-web/api/v1/lost-found/", "/cml-web/api/v1/inventory/"))
                      and scope["path"].endswith(("/photos", "/pictogram")) and photo_fault["armed"])
            if not target:
                await self.app(scope, receive, send)
                return
            messages = []

            async def capture(message):
                messages.append(message)

            await self.app(scope, receive, capture)
            status_code = next(message["status"] for message in messages
                               if message["type"] == "http.response.start")
            if status_code == 200:
                from starlette.responses import JSONResponse

                photo_fault["armed"] = False
                photo_fault["dropped"] += 1
                await JSONResponse({"error": "synthetic_photo_reply_loss"},
                                   status_code=503)(scope, receive, send)
            else:
                for message in messages:
                    await send(message)

    app.add_middleware(DropPhotoReply)

    @app.post("/__fixture/photo-fault")
    def arm_photo_fault():
        photo_fault["armed"] = True
        return {"armed": True}

    @app.post("/__fixture/chat-burst")
    def chat_burst():
        with factory() as db:
            owner = db.scalar(select(ChatParticipant).where(ChatParticipant.principal_type == "admin_profile"))
            employee = db.scalar(select(ChatParticipant).where(ChatParticipant.principal_type == "portal", ChatParticipant.principal_id == 1))
            conversation = db.scalar(select(ChatConversation).where(ChatConversation.participant_low_id == min(owner.id, employee.id), ChatConversation.participant_high_id == max(owner.id, employee.id)))
            start = db.query(ChatMessage).count()
            for index in range(1, 126):
                db.add(ChatMessage(conversation_id=conversation.id, sender_id=employee.id,
                                   body="Syntetický příchozí blok " + str(index),
                                   client_message_id=f"synthetic-burst-{start}-{index}"))
            db.commit()
            return {"count": 125}

    @app.get("/__fixture/readback")
    def readback():
        with factory() as db:
            return {
                "profiles": [{"id": user.id, "email": user.email, "roles": [role.role for role in user.roles]} for user in db.scalars(select(PortalUser))],
                "exports": list(exports),
                "errors": list(fixture_errors),
                "photo_replies_dropped": photo_fault["dropped"],
                "provider_writes": provider.writes,
                "room_states": dict(provider.states),
                "reports": [
                    {"id": r.id, "title": r.title, "status": r.status, "photos": [{"id": photo.id, "bytes": photo.size_bytes} for photo in r.photos]}
                    for r in db.scalars(select(Report))
                ],
                "issues": [{"id": row.id, "title": row.title, "status": row.status, "photos": len(row.photos)} for row in db.scalars(select(Issue))],
                "lostfound": [{"id": row.id, "description": row.description, "status": row.status, "photos": len(row.photos)} for row in db.scalars(select(LostFoundItem))],
                "chat": [{"id": row.id, "conversation_id": row.conversation_id, "sender_id": row.sender_id, "body": row.body, "client_id": row.client_message_id, "read": row.read_at is not None} for row in db.scalars(select(ChatMessage))],
                "chat_push_outbox": db.query(ChatPushOutbox).count(),
                "chat_push_subscriptions": [{"participant_id": row.participant_id} for row in db.scalars(select(ChatPushSubscription))],
                "cards": [{"id": card.id, "number": card.number, "type": card.card_type, "items": [{"id": row.id, "ingredient_id": row.ingredient_id, "quantity": row.quantity_base} for row in card.items]} for card in db.scalars(select(InventoryCard))],
                "movements": [{"id": row.id, "item_id": row.item_id, "card_id": row.card_id, "quantity": row.quantity} for row in db.scalars(select(InventoryMovement))],
                "inventory": [
                    {"id": r.id, "name": r.name, "stock": r.current_stock}
                    for r in db.scalars(select(InventoryItem))
                ],
                "breakfast": [
                    {
                        "id": r.id,
                        "status": r.status,
                        "service_date": r.service_date.isoformat(),
                        "guest_count": r.guest_count,
                        "guest_name": r.guest_name,
                        "diet_no_gluten": r.diet_no_gluten,
                        "diet_no_milk": r.diet_no_milk,
                        "diet_no_pork": r.diet_no_pork,
                    }
                    for r in db.scalars(select(BreakfastOrder))
                ],
            }

    app.state.fixture_directory = _private
    return app


app = build_fixture()
