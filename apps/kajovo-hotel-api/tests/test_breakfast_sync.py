from datetime import date

from app.config import Settings
from app.services.breakfast.sync import BetterHotelBreakfastClient, parse_breakfast_food_codes


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
