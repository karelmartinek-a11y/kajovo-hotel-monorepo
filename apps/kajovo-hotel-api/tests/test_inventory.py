import urllib.error
import urllib.request
from collections.abc import Callable
from http.cookiejar import CookieJar

ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]


def create_item(api_request: ApiRequest, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Pomerancovy dzus",
        "unit": "l",
        "min_stock": 10,
        "current_stock": 12,
        "amount_per_piece_base": 1,
        "supplier": "FreshTrade",
    }
    payload.update(overrides)
    status, data = api_request("/api/v1/inventory", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_inventory_crud_movements_and_audit(api_request: ApiRequest) -> None:
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
        payload={
            "movement_type": "out",
            "quantity": 3,
            "document_date": "2026-03-05",
            "note": "Snidane",
        },
    )
    assert movement_status == 200
    assert isinstance(movement_result, dict)
    assert movement_result["current_stock"] == 9
    assert len(movement_result["movements"]) == 1

    adjust_status, adjust_result = api_request(
        f"/api/v1/inventory/{created['id']}/movements",
        method="POST",
        payload={
            "movement_type": "adjust",
            "quantity": 2,
            "document_date": "2026-03-05",
            "note": "Inventura",
        },
    )
    assert adjust_status == 200
    assert isinstance(adjust_result, dict)
    assert adjust_result["current_stock"] == 7

    detail_status, detail = api_request(f"/api/v1/inventory/{created['id']}")
    assert detail_status == 200
    assert isinstance(detail, dict)
    assert len(detail["audit_logs"]) >= 4


def test_inventory_low_stock_filter_and_validation(api_request: ApiRequest) -> None:
    low = create_item(api_request, name="Mleko", min_stock=10, current_stock=2)
    create_item(api_request, name="Kava", min_stock=3, current_stock=8)

    filter_status, filtered = api_request("/api/v1/inventory", params={"low_stock": "true"})
    assert filter_status == 200
    assert isinstance(filtered, list)
    assert any(item["id"] == low["id"] for item in filtered)

    out_status, out_error = api_request(
        f"/api/v1/inventory/{low['id']}/movements",
        method="POST",
        payload={"movement_type": "out", "quantity": 999, "document_date": "2026-03-05"},
    )
    assert out_status == 400
    assert isinstance(out_error, dict)
    assert out_error["detail"] == "Insufficient stock for OUT movement"


def test_inventory_document_numbering_and_pdf(api_request: ApiRequest, api_base_url: str) -> None:
    created = create_item(api_request, name="Sul", unit="g", amount_per_piece_base=1000)

    status_in, data_in = api_request(
        f"/api/v1/inventory/{created['id']}/movements",
        method="POST",
        payload={
            "movement_type": "in",
            "quantity": 5,
            "document_date": "2026-03-05",
            "document_reference": "DL-2026-0001",
        },
    )
    assert status_in == 200
    assert isinstance(data_in, dict)
    first_doc = data_in["movements"][0]["document_number"]
    assert first_doc.startswith("PR-2026-")

    status_out, data_out = api_request(
        f"/api/v1/inventory/{created['id']}/movements",
        method="POST",
        payload={
            "movement_type": "out",
            "quantity": 2,
            "document_date": "2026-03-05",
        },
    )
    assert status_out == 200
    assert isinstance(data_out, dict)
    out_doc = next(
        movement["document_number"]
        for movement in data_out["movements"]
        if movement["movement_type"] == "out"
    )
    assert out_doc.startswith("VY-2026-")

    opener = getattr(api_request, "opener", urllib.request.build_opener())
    request = urllib.request.Request(url=f"{api_base_url}/api/v1/inventory/stocktake/pdf", method="GET")
    with opener.open(request, timeout=10) as response:
        assert response.status == 200
        assert response.headers.get("content-type") == "application/pdf"
        content = response.read()
        assert content.startswith(b"%PDF-")


def test_inventory_cards_and_movements_feed(api_request: ApiRequest) -> None:
    flour = create_item(
        api_request,
        name="Mouka hladka",
        unit="g",
        current_stock=2000,
        min_stock=500,
        amount_per_piece_base=1000,
    )
    milk = create_item(
        api_request,
        name="Mleko trvanlive",
        unit="l",
        current_stock=3000,
        min_stock=500,
        amount_per_piece_base=1000,
    )

    card_status, card = api_request(
        "/api/v1/inventory/cards",
        method="POST",
        payload={
            "card_type": "out",
            "card_date": "2026-03-05",
            "reference": "VY-TEST-001",
            "note": "Snidanovy vydej",
            "items": [
                {
                    "ingredient_id": flour["id"],
                    "quantity_base": 500,
                    "quantity_pieces": 1,
                    "note": "Test mouka",
                },
                {
                    "ingredient_id": milk["id"],
                    "quantity_base": 1000,
                    "quantity_pieces": 1,
                    "note": "Test mleko",
                },
            ],
        },
    )
    assert card_status == 201
    assert isinstance(card, dict)
    assert card["number"].startswith("VY-2026-")
    assert len(card["items"]) == 2

    cards_status, cards = api_request("/api/v1/inventory/cards")
    assert cards_status == 200
    assert isinstance(cards, list)
    assert cards[0]["id"] == card["id"]

    movements_status, movements = api_request("/api/v1/inventory/movements")
    assert movements_status == 200
    assert isinstance(movements, list)
    assert any(
        movement["card_id"] == card["id"]
        and movement["card_number"] == card["number"]
        and movement["item_name"] == "Mouka hladka"
        for movement in movements
    )

    flour_detail_status, flour_detail = api_request(f"/api/v1/inventory/{flour['id']}")
    assert flour_detail_status == 200
    assert isinstance(flour_detail, dict)
    assert flour_detail["current_stock"] == 1500


def test_inventory_card_delete_reverts_stock(api_request: ApiRequest) -> None:
    created = create_item(
        api_request,
        name="Maslo",
        unit="g",
        current_stock=1000,
        min_stock=100,
        amount_per_piece_base=250,
    )

    card_status, card = api_request(
        "/api/v1/inventory/cards",
        method="POST",
        payload={
            "card_type": "in",
            "card_date": "2026-03-06",
            "reference": "DL-2026-0030",
            "items": [
                {
                    "ingredient_id": created["id"],
                    "quantity_base": 500,
                    "quantity_pieces": 2,
                }
            ],
        },
    )
    assert card_status == 201
    assert isinstance(card, dict)

    detail_status, detail = api_request(f"/api/v1/inventory/{created['id']}")
    assert detail_status == 200
    assert isinstance(detail, dict)
    assert detail["current_stock"] == 1500

    delete_status, _ = api_request(f"/api/v1/inventory/cards/{card['id']}", method="DELETE")
    assert delete_status == 204

    reverted_status, reverted = api_request(f"/api/v1/inventory/{created['id']}")
    assert reverted_status == 200
    assert isinstance(reverted, dict)
    assert reverted["current_stock"] == 1000


def test_inventory_delete_requires_admin(api_request: ApiRequest, api_base_url: str) -> None:
    created = create_item(api_request, name="Test Delete", unit="ks", amount_per_piece_base=1)
    status_in, data_in = api_request(
        f"/api/v1/inventory/{created['id']}/movements",
        method="POST",
        payload={
            "movement_type": "in",
            "quantity": 1,
            "document_date": "2026-03-05",
            "document_reference": "DL-2026-0002",
        },
    )
    assert status_in == 200
    assert isinstance(data_in, dict)
    movement_id = data_in["movements"][0]["id"]

    portal_jar = CookieJar()
    portal_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(portal_jar))
    login_payload = b"{\"email\":\"sklad@example.com\",\"password\":\"sklad-pass\"}"
    login_request = urllib.request.Request(
        url=f"{api_base_url}/api/auth/login",
        data=login_payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with portal_opener.open(login_request, timeout=10) as response:
        assert response.status == 200
    csrf_token = next((cookie.value for cookie in portal_jar if cookie.name == "kajovo_csrf"), "")
    delete_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/inventory/{created['id']}/movements/{movement_id}",
        headers={"x-csrf-token": csrf_token},
        method="DELETE",
    )
    try:
        portal_opener.open(delete_request, timeout=10)
        assert False, "Expected 403 for portal delete"
    except urllib.error.HTTPError as exc:
        assert exc.code == 403

    delete_status, _ = api_request(
        f"/api/v1/inventory/{created['id']}/movements/{movement_id}",
        method="DELETE",
    )
    assert delete_status == 204

    item_delete_status, item_delete_error = api_request(
        f"/api/v1/inventory/{created['id']}",
        method="DELETE",
    )
    assert item_delete_status == 400
    assert isinstance(item_delete_error, dict)
    assert item_delete_error["detail"] == "Inventory item with history cannot be deleted"


def test_inventory_bootstrap_is_disabled_by_default(api_request: ApiRequest) -> None:
    status, data = api_request("/api/v1/inventory/bootstrap-status")
    assert status == 200
    assert isinstance(data, dict)
    assert data["enabled"] is False

    seed_status, seed_error = api_request("/api/v1/inventory/seed-defaults", method="POST")
    assert seed_status == 403
    assert isinstance(seed_error, dict)
    assert seed_error["detail"] == "Inventory bootstrap is disabled"
