import json
import urllib.error
import urllib.parse
import urllib.request


def api_request(
    base_url: str,
    path: str,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    params: dict[str, str] | None = None,
) -> tuple[int, dict[str, object] | list[dict[str, object]] | None]:
    url = f"{base_url}{path}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    data = None
    headers: dict[str, str] = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url=url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        parsed = json.loads(raw) if raw else None
        return exc.code, parsed


def create_item(base_url: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "item_type": "found",
        "description": "Černá peněženka nalezená ve wellness zóně",
        "category": "osobní věci",
        "location": "Wellness",
        "event_at": "2026-02-18T10:00:00Z",
        "status": "stored",
    }
    payload.update(overrides)
    status, data = api_request(base_url, "/api/v1/lost-found", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_lost_found_crud(api_base_url: str) -> None:
    created = create_item(api_base_url)

    list_status, listed = api_request(api_base_url, "/api/v1/lost-found")
    assert list_status == 200
    assert isinstance(listed, list)
    assert len(listed) == 1

    update_status, updated = api_request(
        api_base_url,
        f"/api/v1/lost-found/{created['id']}",
        method="PUT",
        payload={
            "status": "claimed",
            "claimant_name": "Jan Novák",
            "claimant_contact": "+420777888999",
            "handover_note": "Předáno na recepci oproti podpisu",
            "returned_at": "2026-02-18T12:30:00Z",
        },
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "claimed"
    assert updated["claimant_name"] == "Jan Novák"
    assert updated["claimed_at"] is not None

    detail_status, detail = api_request(api_base_url, f"/api/v1/lost-found/{created['id']}")
    assert detail_status == 200
    assert isinstance(detail, dict)
    assert detail["claimant_contact"] == "+420777888999"

    delete_status, _ = api_request(
        api_base_url,
        f"/api/v1/lost-found/{created['id']}",
        method="DELETE",
    )
    assert delete_status == 204

    not_found_status, _ = api_request(api_base_url, f"/api/v1/lost-found/{created['id']}")
    assert not_found_status == 404


def test_lost_found_filters(api_base_url: str) -> None:
    create_item(
        api_base_url,
        item_type="lost",
        description="Ztracený náramek",
        category="šperky",
        location="Pokoj 203",
        event_at="2026-02-18T09:00:00Z",
    )
    create_item(
        api_base_url,
        item_type="found",
        description="Nalezený tablet",
        category="elektronika",
        location="Lobby",
        event_at="2026-02-18T11:00:00Z",
        status="returned",
    )

    lost_status, lost_items = api_request(
        api_base_url,
        "/api/v1/lost-found",
        params={"type": "lost"},
    )
    assert lost_status == 200
    assert isinstance(lost_items, list)
    assert len(lost_items) == 1
    assert lost_items[0]["category"] == "šperky"

    returned_status, returned_items = api_request(
        api_base_url,
        "/api/v1/lost-found",
        params={"status": "returned"},
    )
    assert returned_status == 200
    assert isinstance(returned_items, list)
    assert len(returned_items) == 1
    assert returned_items[0]["description"] == "Nalezený tablet"
