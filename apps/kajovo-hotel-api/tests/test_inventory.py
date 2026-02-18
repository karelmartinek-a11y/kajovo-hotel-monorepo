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
        "name": "Pomerančový džus",
        "unit": "l",
        "min_stock": 10,
        "current_stock": 12,
        "supplier": "FreshTrade",
    }
    payload.update(overrides)
    status, data = api_request(base_url, "/api/v1/inventory", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_inventory_crud_movements_and_audit(api_base_url: str) -> None:
    created = create_item(api_base_url)

    status, listed = api_request(api_base_url, "/api/v1/inventory")
    assert status == 200
    assert isinstance(listed, list)
    assert len(listed) == 1

    update_status, updated = api_request(
        api_base_url,
        f"/api/v1/inventory/{created['id']}",
        method="PUT",
        payload={"supplier": "Updated Supplier", "min_stock": 15},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["supplier"] == "Updated Supplier"
    assert updated["min_stock"] == 15

    movement_status, movement_result = api_request(
        api_base_url,
        f"/api/v1/inventory/{created['id']}/movements",
        method="POST",
        payload={"movement_type": "out", "quantity": 3, "note": "Snídaně"},
    )
    assert movement_status == 200
    assert isinstance(movement_result, dict)
    assert movement_result["current_stock"] == 9
    assert len(movement_result["movements"]) == 1

    adjust_status, adjust_result = api_request(
        api_base_url,
        f"/api/v1/inventory/{created['id']}/movements",
        method="POST",
        payload={"movement_type": "adjust", "quantity": 20, "note": "Inventura"},
    )
    assert adjust_status == 200
    assert isinstance(adjust_result, dict)
    assert adjust_result["current_stock"] == 20

    detail_status, detail = api_request(api_base_url, f"/api/v1/inventory/{created['id']}")
    assert detail_status == 200
    assert isinstance(detail, dict)
    assert len(detail["audit_logs"]) >= 4


def test_inventory_low_stock_filter_and_validation(api_base_url: str) -> None:
    low = create_item(api_base_url, name="Mléko", min_stock=10, current_stock=2)
    create_item(api_base_url, name="Káva", min_stock=3, current_stock=8)

    filter_status, filtered = api_request(
        api_base_url, "/api/v1/inventory", params={"low_stock": "true"}
    )
    assert filter_status == 200
    assert isinstance(filtered, list)
    assert len(filtered) == 1
    assert filtered[0]["id"] == low["id"]

    out_status, out_error = api_request(
        api_base_url,
        f"/api/v1/inventory/{low['id']}/movements",
        method="POST",
        payload={"movement_type": "out", "quantity": 999},
    )
    assert out_status == 400
    assert isinstance(out_error, dict)
    assert out_error["detail"] == "Insufficient stock for OUT movement"
