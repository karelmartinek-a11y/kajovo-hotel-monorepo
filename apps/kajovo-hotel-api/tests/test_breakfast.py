from collections.abc import Callable
from datetime import date


def create_order(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]], **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "service_date": "2026-02-19",
        "room_number": "201",
        "guest_name": "Novák",
        "guest_count": 2,
        "status": "pending",
        "note": "Bez lepku",
    }
    payload.update(overrides)
    status, data = api_request("/api/v1/breakfast", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_create_and_read_breakfast_order(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]]) -> None:
    created = create_order(api_request)

    status, data = api_request(f"/api/v1/breakfast/{created['id']}")

    assert status == 200
    assert isinstance(data, dict)
    assert data["room_number"] == "201"
    assert data["status"] == "pending"
    assert data["guest_count"] == 2


def test_breakfast_list_filter_and_daily_summary(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]]) -> None:
    create_order(
        api_request,
        service_date="2026-02-22",
        room_number="101",
        guest_count=1,
        status="pending",
    )
    create_order(
        api_request,
        service_date="2026-02-22",
        room_number="102",
        guest_count=3,
        status="served",
    )
    create_order(api_request, service_date="2026-02-20", room_number="202", status="cancelled")

    status, listed = api_request(
        "/api/v1/breakfast",
        params={"service_date": "2026-02-22", "status": "served"},
    )
    assert status == 200
    assert isinstance(listed, list)
    assert len(listed) == 1
    assert listed[0]["room_number"] == "102"

    summary_status, summary = api_request(
        "/api/v1/breakfast/daily-summary",
        params={"service_date": "2026-02-22"},
    )

    assert summary_status == 200
    assert isinstance(summary, dict)
    assert summary["service_date"] == "2026-02-22"
    assert summary["total_orders"] == 2
    assert summary["total_guests"] == 4
    assert summary["status_counts"]["pending"] == 1
    assert summary["status_counts"]["served"] == 1


def test_update_and_delete_breakfast_order(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]]) -> None:
    created = create_order(api_request, note="Původní")

    status, updated = api_request(
        f"/api/v1/breakfast/{created['id']}",
        method="PUT",
        payload={"status": "preparing", "note": "Změněná poznámka"},
    )

    assert status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "preparing"
    assert updated["note"] == "Změněná poznámka"

    delete_status, _ = api_request(
        f"/api/v1/breakfast/{created['id']}",
        method="DELETE",
    )
    assert delete_status == 204

    read_status, _ = api_request(f"/api/v1/breakfast/{created['id']}")
    assert read_status == 404


def test_breakfast_validation_errors(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]]) -> None:
    status, _ = api_request(
        "/api/v1/breakfast",
        method="POST",
        payload={
            "service_date": str(date(2026, 2, 19)),
            "room_number": "",
            "guest_name": "Host",
            "guest_count": 0,
            "status": "pending",
        },
    )

    assert status == 422
