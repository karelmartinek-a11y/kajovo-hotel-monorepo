from datetime import date

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.db.models import Base, BreakfastOrder
from app.services.breakfast import sync as breakfast_sync_service
from app.services.breakfast.sync import (
    BetterHotelBreakfastAggregate,
    BetterHotelBreakfastClient,
    parse_breakfast_food_codes,
    sync_breakfast_range,
)


def test_better_hotel_sync_maps_food_flags_to_breakfast_days(monkeypatch) -> None:
    monkeypatch.setenv("BETTER_HOTEL_ACCESS_TOKEN", "access")
    monkeypatch.setenv("BETTER_HOTEL_CLIENT_TOKEN", "client")
    settings = Settings(_env_file=None)
    client = BetterHotelBreakfastClient(settings)

    def fake_list_breakfast_reservations(*, service_start: date, service_end: date):
        assert service_start == date(2026, 6, 22)
        assert service_end == date(2026, 6, 29)
        return [
            {
                "id": "res-1",
                "arrival": "2026-06-21",
                "departure": "2026-06-24",
                "room": {"name": "102 KOMFORT"},
                "guest_list": [
                    {"food": 1, "guest": {"first_name": "Jan", "last_name": "Novak"}},
                    {"food": 2, "guest": {"first_name": "Eva", "last_name": "Nova"}},
                    {"food": 0, "guest": {"first_name": "Bez", "last_name": "Snidane"}},
                ],
            },
            {
                "id": "res-2",
                "arrival": "2026-06-23",
                "departure": "2026-06-24",
                "room": {"name": "205 SUPERIOR"},
                "guest_list": [
                    {"food": 3, "guest": {"first_name": "Petr", "last_name": "Host"}},
                ],
            },
        ]

    monkeypatch.setattr(client, "list_breakfast_reservations", fake_list_breakfast_reservations)

    aggregates, reservations_count, _ = client.build_aggregates(
        service_start=date(2026, 6, 22),
        service_end=date(2026, 6, 29),
    )

    assert reservations_count == 2
    assert [(item.service_date.isoformat(), item.room_number, item.guest_count) for item in aggregates] == [
        ("2026-06-22", "102", 2),
        ("2026-06-23", "102", 2),
        ("2026-06-24", "102", 2),
        ("2026-06-24", "205", 1),
    ]
    assert aggregates[0].guest_name == "Jan Novak; Eva Nova"


def test_breakfast_sync_admin_endpoint_and_removed_mailbox(api_request) -> None:
    status, payload = api_request("/api/v1/admin/settings/breakfast-sync")
    assert status == 200
    assert isinstance(payload, dict)
    assert payload["provider"] == "better_hotel_api"
    assert payload["breakfast_window_days_forward"] == 7
    assert payload["breakfast_food_codes"] == [1, 2, 3]
    assert payload["schedule_times"] == ["14:00", "16:00", "18:00", "20:00", "22:20", "23:50"]

    removed_status, _ = api_request("/api/v1/admin/settings/breakfast-mailbox")
    assert removed_status == 404


def test_parse_breakfast_food_codes_always_includes_half_and_full_board() -> None:
    assert parse_breakfast_food_codes("1") == {1, 2, 3}
    assert parse_breakfast_food_codes("5") == {1, 2, 3, 5}


def test_better_hotel_sync_keeps_user_notes_but_does_not_create_system_notes(
    tmp_path, monkeypatch
) -> None:
    target_day = date(2026, 7, 24)
    engine = create_engine(f"sqlite:///{tmp_path / 'breakfast-sync-notes.db'}")
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine)

    with session_local() as db:
        db.add(
            BreakfastOrder(
                service_date=target_day,
                room_number="101",
                guest_name="Puvodni host",
                guest_count=1,
                status="pending",
                note="Rucni poznamka recepce",
                diet_no_gluten=True,
                diet_no_milk=False,
                diet_no_pork=True,
            )
        )
        db.add(
            BreakfastOrder(
                service_date=target_day,
                room_number="102",
                guest_name="Systemovy host",
                guest_count=1,
                status="pending",
                note="Automatická synchronizace Better Hotel API",
                diet_no_gluten=False,
                diet_no_milk=True,
                diet_no_pork=False,
            )
        )
        db.commit()

    class FakeBetterHotelBreakfastClient:
        def __init__(self, settings):
            self.settings = settings

        def build_aggregates(self, *, service_start: date, service_end: date):
            assert service_start == target_day
            assert service_end == target_day
            return (
                [
                    BetterHotelBreakfastAggregate(
                        service_date=target_day,
                        room_number="101",
                        guest_count=2,
                        guest_name="Novy host",
                    ),
                    BetterHotelBreakfastAggregate(
                        service_date=target_day,
                        room_number="102",
                        guest_count=1,
                        guest_name="Bez poznamky",
                    ),
                ],
                2,
                "source-hash",
            )

    monkeypatch.setattr(breakfast_sync_service, "BetterHotelBreakfastClient", FakeBetterHotelBreakfastClient)
    monkeypatch.setattr(breakfast_sync_service, "prague_today", lambda: target_day)

    with session_local() as db:
        result = sync_breakfast_range(
            db,
            settings=Settings(_env_file=None),
            range_start=target_day,
            range_end=target_day,
            trigger="test",
            note="Automaticka synchronizace Better Hotel API",
        )

    assert result.imported_rows == 2
    with session_local() as db:
        rows = db.scalars(
            select(BreakfastOrder)
            .where(BreakfastOrder.service_date == target_day)
            .order_by(BreakfastOrder.room_number.asc())
        ).all()

    assert [(row.room_number, row.note) for row in rows] == [
        ("101", "Rucni poznamka recepce"),
        ("102", None),
    ]
    assert rows[0].diet_no_gluten is True
    assert rows[0].diet_no_pork is True
    assert rows[1].diet_no_milk is True
