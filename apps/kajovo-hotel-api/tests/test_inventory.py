import urllib.error
import urllib.request
from collections.abc import Callable
from http.cookiejar import CookieJar
from pathlib import Path

ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]


def create_item(api_request: ApiRequest, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Pomerancovy dzus",
        "unit": "l",
        "min_stock": 10,
        "current_stock": 12,
        "amount_per_piece_base": 1,
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
        payload={"min_stock": 15, "amount_per_piece_base": 6},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["min_stock"] == 15
    assert updated["amount_per_piece_base"] == 6

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


def test_inventory_pictogram_upload_requires_csrf_and_persists_media(
    api_request: ApiRequest, api_base_url: str
) -> None:
    created = create_item(api_request, name="Miniatura", unit="ks", amount_per_piece_base=1)

    opener = getattr(api_request, "opener", urllib.request.build_opener())
    csrf_token = next(
        (cookie.value for cookie in getattr(api_request, "jar", []) if cookie.name == "kajovo_csrf"),
        "",
    )
    fixture_path = Path(__file__).resolve().parents[3] / "apps" / "kajovo-hotel-admin" / "tests" / "fixtures" / "inventory-thumb.png"
    boundary = "inventory-boundary"
    file_bytes = fixture_path.read_bytes()
    multipart = (
        b"--" + boundary.encode("ascii") + b"\r\n"
        + b'Content-Disposition: form-data; name="file"; filename="inventory-thumb.png"\r\n'
        + b"Content-Type: image/png\r\n\r\n"
        + file_bytes
        + b"\r\n--" + boundary.encode("ascii") + b"--\r\n"
    )

    missing_csrf_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/inventory/{created['id']}/pictogram",
        data=multipart,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        opener.open(missing_csrf_request, timeout=10)
        assert False, "Expected 403 for pictogram upload without CSRF"
    except urllib.error.HTTPError as exc:
        assert exc.code == 403

    upload_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/inventory/{created['id']}/pictogram",
        data=multipart,
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "x-csrf-token": csrf_token,
        },
        method="POST",
    )
    with opener.open(upload_request, timeout=10) as response:
        assert response.status == 200

    detail_status, detail = api_request(f"/api/v1/inventory/{created['id']}")
    assert detail_status == 200
    assert isinstance(detail, dict)
    assert isinstance(detail["pictogram_path"], str)
    assert isinstance(detail["pictogram_thumb_path"], str)

    thumb_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/inventory/{created['id']}/pictogram/thumb",
        method="GET",
    )
    with opener.open(thumb_request, timeout=10) as response:
        assert response.status == 200
        assert response.headers.get_content_type().startswith("image/")
        assert len(response.read()) > 0


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


def test_inventory_item_management_and_stocktake_require_admin(
    api_request: ApiRequest, api_base_url: str
) -> None:
    created = create_item(api_request, name="Admin Only Item", unit="ks", amount_per_piece_base=1)

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

    create_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/inventory",
        data=b'{\"name\":\"Portal Item\",\"unit\":\"ks\",\"min_stock\":1,\"current_stock\":0,\"amount_per_piece_base\":1}',
        headers={"Content-Type": "application/json", "x-csrf-token": csrf_token},
        method="POST",
    )
    try:
        portal_opener.open(create_request, timeout=10)
        assert False, "Expected 403 for portal item create"
    except urllib.error.HTTPError as exc:
        assert exc.code == 403

    detail_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/inventory/{created['id']}",
        method="GET",
    )
    try:
        portal_opener.open(detail_request, timeout=10)
        assert False, "Expected 403 for portal inventory detail"
    except urllib.error.HTTPError as exc:
        assert exc.code == 403

    stocktake_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/inventory/stocktake/pdf",
        method="GET",
    )
    try:
        portal_opener.open(stocktake_request, timeout=10)
        assert False, "Expected 403 for portal stocktake export"
    except urllib.error.HTTPError as exc:
        assert exc.code == 403
