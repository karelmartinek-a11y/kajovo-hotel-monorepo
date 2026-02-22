from collections.abc import Callable

ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]


def create_record(api_request: ApiRequest, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "item_type": "found",
        "description": "Stříbrná náušnice",
        "category": "Jewelry",
        "location": "Pokoj 402",
        "event_at": "2026-02-20T10:00:00Z",
        "status": "stored",
    }
    payload.update(overrides)
    status, data = api_request("/api/v1/lost-found", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_lost_found_crud(api_request: ApiRequest) -> None:
    created = create_record(api_request)

    read_status, detail = api_request(f"/api/v1/lost-found/{created['id']}")
    assert read_status == 200
    assert isinstance(detail, dict)
    assert detail["category"] == "Jewelry"

    update_status, updated = api_request(
        f"/api/v1/lost-found/{created['id']}",
        method="PUT",
        payload={"status": "claimed", "claimant_name": "Host 402"},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "claimed"
    assert updated["claimant_name"] == "Host 402"

    delete_status, _ = api_request(f"/api/v1/lost-found/{created['id']}", method="DELETE")
    assert delete_status == 204


def test_lost_found_filters(api_request: ApiRequest) -> None:
    create_record(api_request, category="Kabelka", status="stored")
    create_record(api_request, category="Peněženka", status="claimed")

    status, filtered = api_request("/api/v1/lost-found", params={"status": "claimed"})
    assert status == 200
    assert isinstance(filtered, list)
    assert len(filtered) == 1
    assert filtered[0]["category"] == "Peněženka"
