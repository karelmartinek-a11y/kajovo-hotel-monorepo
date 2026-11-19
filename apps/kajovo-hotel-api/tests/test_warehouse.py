import sqlite3


def test_cml_warehouse_data_and_legacy_default_are_isolated(cml_api_request, api_request, api_db_path):
    base = "/api/v1/inventory"
    breakfast = {"warehouse": "snidane"}
    drugstore = {"warehouse": "drogerie"}
    assert cml_api_request(base, params={"warehouse": "other"})[0] == 422
    for suffix in ("", "/cards", "/movements"):
        assert cml_api_request(base + suffix, params=drugstore) == (200, [])

    def create(name, stock, params):
        code, item = cml_api_request(base, "POST", {
            "name": name, "unit": "ks", "min_stock": 1, "current_stock": stock,
        }, params)
        assert code == 201
        return item

    food = create("Izolovaná snídaně", 9, breakfast)
    cleaner = create("Izolovaná drogerie", 3, drugstore)
    assert api_request(f"{base}/{food['id']}")[1]["name"] == food["name"]
    assert len(cml_api_request(base, params=drugstore)[1]) == 1
    assert cleaner["name"] not in [row["name"] for row in cml_api_request(base, params=breakfast)[1]]

    code, card = cml_api_request(base + "/cards", "POST", {
        "card_type": "out", "card_date": "2026-11-19",
        "items": [{"ingredient_id": cleaner["id"], "quantity_base": 2}],
    }, drugstore)
    assert code == 201
    assert cml_api_request(base + "/cards", params=drugstore)[1][0]["id"] == card["id"]
    assert cml_api_request(base + "/movements", params=drugstore)[1][0]["quantity"] == 2
    assert cml_api_request(f"{base}/{cleaner['id']}", params=drugstore)[1]["current_stock"] == 1
    assert cml_api_request(f"{base}/{food['id']}", params=breakfast)[1]["current_stock"] == 9

    assert cml_api_request(f"{base}/cards/{card['id']}", "DELETE", params=drugstore)[0] == 204
    assert cml_api_request(base + "/movements", params=drugstore) == (200, [])
    assert cml_api_request(f"{base}/{cleaner['id']}", params=drugstore)[1]["current_stock"] == 3

    for warehouse, item in [(breakfast, food), (drugstore, cleaner)]:
        name = f"{api_db_path.stem}_sklad_{warehouse['warehouse']}{api_db_path.suffix}"
        with sqlite3.connect(api_db_path.with_name(name)) as stock:
            assert stock.execute("SELECT name FROM inventory_items WHERE id = ?", (item["id"],)).fetchone() == (item["name"],)
            assert stock.execute("SELECT name FROM sqlite_master WHERE name = 'portal_users'").fetchone() is None
    with sqlite3.connect(api_db_path) as hotel:
        assert hotel.execute("SELECT count(*) FROM inventory_items").fetchone() == (0,)
