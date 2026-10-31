"""Native stock documents: totals, atomic rejection and reversible own effects."""

import pytest

from tests.test_inventory import ApiRequest, create_item


@pytest.mark.parametrize("kind", ["out", "adjust"])
def test_card_duplicate_lines_cannot_overdraw_stock(api_request: ApiRequest, kind: str):
    item = create_item(api_request, name="Synthetic document balance", current_stock=12)
    _, before_cards = api_request("/api/v1/inventory/cards")
    _, before_movements = api_request("/api/v1/inventory/movements")
    status, error = api_request("/api/v1/inventory/cards", method="POST", payload={
        "card_type": kind, "card_date": "2026-10-31", "items": [
            {"ingredient_id": item["id"], "quantity_base": 7},
            {"ingredient_id": item["id"], "quantity_base": 6},
        ],
    })
    assert status == 400
    assert "Nedostatečný skladový stav" in error["detail"]
    _, actual = api_request(f"/api/v1/inventory/{item['id']}")
    assert actual["current_stock"] == 12 and actual["movements"] == []
    assert api_request("/api/v1/inventory/cards")[1] == before_cards
    assert api_request("/api/v1/inventory/movements")[1] == before_movements


def test_balanced_card_preserves_lines_and_delete_restores_original_stock(api_request: ApiRequest):
    item = create_item(api_request, name="Synthetic exact document balance", current_stock=12)
    status, card = api_request("/api/v1/inventory/cards", method="POST", payload={
        "card_type": "out", "card_date": "2026-10-31", "reference": "ISOLATED-TEST",
        "items": [{"ingredient_id": item["id"], "quantity_base": 7},
                  {"ingredient_id": item["id"], "quantity_base": 5}],
    })
    assert status == 201 and len(card["items"]) == 2
    _, stored = api_request(f"/api/v1/inventory/cards/{card['id']}")
    assert stored == card
    _, actual = api_request(f"/api/v1/inventory/{item['id']}")
    assert actual["current_stock"] == 0
    assert sum(row["quantity"] for row in actual["movements"]) == 12
    assert {row["card_id"] for row in actual["movements"]} == {card["id"]}
    assert api_request(f"/api/v1/inventory/cards/{card['id']}", method="DELETE")[0] == 204
    _, restored = api_request(f"/api/v1/inventory/{item['id']}")
    assert restored["current_stock"] == 12 and restored["movements"] == []
    assert api_request(f"/api/v1/inventory/cards/{card['id']}")[0] == 404
