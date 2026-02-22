from collections.abc import Callable


def create_item(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]], **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Pomerančový džus",
        "unit": "l",
        "min_stock": 10,
        "current_stock": 12,
        "supplier": "FreshTrade",
    }
    payload.update(overrides)
    status, data = api_request("/api/v1/inventory", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_inventory_crud_movements_and_audit(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]]) -> None:
    created = create_item(api_request)

    status, listed = api_request("/api/v1/inventory")
    assert status == 200
    assert isinstance(listed, list)
    assert len(listed) == 1

    update_status, updated = api_request(
        f"/api/v1/inventory/{created['id']}",
        method="PUT",
        payload={"supplier": "Updated Supplier", "min_stock": 15},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["supplier"] == "Updated Supplier"
    assert updated["min_stock"] == 15

    movement_status, movement_result = api_request(
        f"/api/v1/inventory/{created['id']}/movements",
        method="POST",
        payload={"movement_type": "out", "quantity": 3, "note": "Snídaně"},
    )
    assert movement_status == 200
    assert isinstance(movement_result, dict)
    assert movement_result["current_stock"] == 9
    assert len(movement_result["movements"]) == 1

    adjust_status, adjust_result = api_request(
        f"/api/v1/inventory/{created['id']}/movements",
        method="POST",
        payload={"movement_type": "adjust", "quantity": 20, "note": "Inventura"},
    )
    assert adjust_status == 200
    assert isinstance(adjust_result, dict)
    assert adjust_result["current_stock"] == 20

    detail_status, detail = api_request(f"/api/v1/inventory/{created['id']}")
    assert detail_status == 200
    assert isinstance(detail, dict)
    assert len(detail["audit_logs"]) >= 4


def test_inventory_low_stock_filter_and_validation(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]]) -> None:
    low = create_item(api_request, name="Mléko", min_stock=10, current_stock=2)
    create_item(api_request, name="Káva", min_stock=3, current_stock=8)

    filter_status, filtered = api_request("/api/v1/inventory", params={"low_stock": "true"})
    assert filter_status == 200
    assert isinstance(filtered, list)
    assert len(filtered) == 1
    assert filtered[0]["id"] == low["id"]

    out_status, out_error = api_request(
        f"/api/v1/inventory/{low['id']}/movements",
        method="POST",
        payload={"movement_type": "out", "quantity": 999},
    )
    assert out_status == 400
    assert isinstance(out_error, dict)
    assert out_error["detail"] == "Insufficient stock for OUT movement"
