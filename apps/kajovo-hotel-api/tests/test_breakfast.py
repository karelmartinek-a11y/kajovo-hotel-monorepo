import json
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Callable
from datetime import date
from http.cookiejar import CookieJar
from pathlib import Path

from app.services.breakfast.parser import parse_breakfast_pdf, parse_breakfast_text

ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

SAMPLE_PDF_PATH = (
    Path(__file__).resolve().parents[3] / "docs" / "breakfast" / "breakfast-sample.pdf"
)


def csrf_header(cookie_jar: CookieJar) -> dict[str, str]:
    token = next((cookie.value for cookie in cookie_jar if cookie.name == "kajovo_csrf"), "")
    return {"x-csrf-token": token} if token else {}


def build_multipart(
    fields: dict[str, str], files: list[tuple[str, str, bytes, str]]
) -> tuple[bytes, str]:
    boundary = f"----kajovo{uuid.uuid4().hex}"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(value.encode("utf-8"))
        body.extend(b"\r\n")
    for field_name, filename, content, content_type in files:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode(
                "utf-8"
            )
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(content)
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def portal_login(
    api_base_url: str, email: str, password: str
) -> tuple[urllib.request.OpenerDirector, CookieJar]:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    request = urllib.request.Request(
        url=f"{api_base_url}/api/auth/login",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(request, timeout=10) as response:
        assert response.status == 200
    return opener, jar


def portal_request(api_base_url: str, email: str, password: str) -> ApiRequest:
    opener, jar = portal_login(api_base_url, email, password)

    def _request(
        path: str,
        method: str = "GET",
        payload: dict[str, object] | None = None,
        params: dict[str, str] | None = None,
    ) -> tuple[int, ResponseData]:
        url = f"{api_base_url}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"

        data = None
        headers: dict[str, str] = {}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        if method.upper() in WRITE_METHODS:
            headers.update(csrf_header(jar))

        request = urllib.request.Request(url=url, data=data, headers=headers, method=method)
        try:
            with opener.open(request, timeout=10) as response:
                raw = response.read().decode("utf-8")
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            parsed = json.loads(raw) if raw else None
            return exc.code, parsed

    return _request


def create_order(api_request: ApiRequest, **overrides: object) -> dict[str, object]:
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


def test_create_and_read_breakfast_order(api_request: ApiRequest) -> None:
    created = create_order(api_request)

    status, data = api_request(f"/api/v1/breakfast/{created['id']}")

    assert status == 200
    assert isinstance(data, dict)
    assert data["room_number"] == "201"
    assert data["status"] == "pending"
    assert data["guest_count"] == 2


def test_breakfast_list_filter_and_daily_summary(api_request: ApiRequest) -> None:
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


def test_update_and_delete_breakfast_order(api_request: ApiRequest) -> None:
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


def test_breakfast_validation_errors(api_request: ApiRequest) -> None:
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


def test_parse_breakfast_sample_pdf() -> None:
    pdf_bytes = SAMPLE_PDF_PATH.read_bytes()
    parsed_day, rows = parse_breakfast_pdf(pdf_bytes)

    assert parsed_day == date(2026, 3, 5)
    assert [row.room for row in rows] == ["101", "102", "103"]
    assert [row.breakfast_count for row in rows] == [2, 1, 1]
    assert rows[0].guest_name == "Jan Novak"


def test_parse_breakfast_text_for_hotel_chodov_pdf_shape() -> None:
    parsed_day, rows = parse_breakfast_text(
        """
Přehled stravy 25.1.2026
POKOJ OZNAČENÍ REZERVACE PŘÍJEZD ODJEZD Den BEZ STRAVY SNÍDANĚ
101 KOMFORT Richard Sýkora; Jiří Brejcha 24.01.-25.01. 2 / 2 0 3 0 0 3 0 0 0
204 SUPERIOR pan Nitra 24.01.-25.01. 2 / 2 0 1 0 0 0 0 0 0
301 KOMFORT Gheorghe Pascal; Booking.com B.V. 23.01.-25.01. 3 / 3 0 3 0 0 0 0 0 0
305 SUPERIOR Glenda Mehrani-Mylany; Booking.com B.V. 24.01.-26.01. 2 / 3 0 2 0 0 0 0 0 0
"""
    )

    assert parsed_day == date(2026, 1, 25)
    assert [row.room for row in rows] == ["101", "204", "301", "305"]
    assert [row.breakfast_count for row in rows] == [3, 1, 3, 2]
    assert rows[0].guest_name == "Richard Sýkora; Jiří Brejcha"
    assert rows[1].guest_name == "pan Nitra"
    assert rows[2].guest_name == "Gheorghe Pascal"
    assert rows[3].guest_name == "Glenda Mehrani-Mylany"


def test_import_breakfast_pdf_overwrite_and_diets(
    api_request: ApiRequest, api_base_url: str
) -> None:
    create_order(
        api_request,
        service_date="2026-03-05",
        room_number="101",
        guest_name="Stary Host",
        guest_count=1,
        status="served",
    )

    opener = api_request.opener  # type: ignore[attr-defined]
    jar = api_request.jar  # type: ignore[attr-defined]
    pdf_bytes = SAMPLE_PDF_PATH.read_bytes()
    overrides = json.dumps(
        [
            {
                "room": "101",
                "diet_no_gluten": True,
                "diet_no_milk": False,
                "diet_no_pork": True,
            }
        ]
    )
    payload, content_type = build_multipart(
        {"save": "true", "overrides": overrides},
        [("file", "breakfast-sample.pdf", pdf_bytes, "application/pdf")],
    )

    request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/breakfast/import",
        data=payload,
        headers={"Content-Type": content_type, **csrf_header(jar)},
        method="POST",
    )
    with opener.open(request, timeout=10) as response:
        assert response.status == 200
        data = json.loads(response.read().decode("utf-8"))
        assert data["saved"] is True
        assert data["date"] == "2026-03-05"
        assert len(data["items"]) == 3

    status, listed = api_request(
        "/api/v1/breakfast",
        params={"service_date": "2026-03-05"},
    )
    assert status == 200
    assert isinstance(listed, list)
    assert len(listed) == 3
    assert all(item["status"] == "pending" for item in listed)
    room_101 = next(item for item in listed if item["room_number"] == "101")
    assert room_101["diet_no_gluten"] is True
    assert room_101["diet_no_pork"] is True


def test_import_breakfast_pdf_preview_does_not_mutate_existing_orders(
    api_request: ApiRequest, api_base_url: str
) -> None:
    create_order(
        api_request,
        service_date="2026-03-05",
        room_number="111",
        guest_name="Preview Guest",
        guest_count=1,
        status="served",
    )
    opener = api_request.opener  # type: ignore[attr-defined]
    jar = api_request.jar  # type: ignore[attr-defined]
    pdf_bytes = SAMPLE_PDF_PATH.read_bytes()
    payload, content_type = build_multipart(
        {"save": "false"},
        [("file", "breakfast-sample.pdf", pdf_bytes, "application/pdf")],
    )
    request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/breakfast/import",
        data=payload,
        headers={"Content-Type": content_type, **csrf_header(jar)},
        method="POST",
    )
    with opener.open(request, timeout=10) as response:
        assert response.status == 200
        data = json.loads(response.read().decode("utf-8"))
        assert data["saved"] is False
        assert len(data["items"]) == 3

    status, listed = api_request("/api/v1/breakfast", params={"service_date": "2026-03-05"})
    assert status == 200
    assert isinstance(listed, list)
    assert any(item["room_number"] == "111" for item in listed)


def test_breakfast_export_pdf(api_request: ApiRequest, api_base_url: str) -> None:
    target_date = "2026-03-09"
    create_order(
        api_request,
        service_date=target_date,
        room_number="303",
        guest_name="Export Test",
        guest_count=2,
        status="pending",
    )

    opener = getattr(api_request, "opener", urllib.request.build_opener())
    request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/breakfast/export/daily?service_date={urllib.parse.quote(target_date)}",
        method="GET",
    )
    try:
        with opener.open(request, timeout=10) as response:
            assert response.status == 200
            assert response.headers.get("content-type") == "application/pdf"
            content = response.read()
            assert content.startswith(b"%PDF-")
            assert b"Datum: 2026-03-09" in content
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise AssertionError(f"Export request failed: {exc.code} {exc.reason} {detail}") from exc


def test_breakfast_reactivation_rbac(api_base_url: str, api_request: ApiRequest) -> None:
    created = create_order(
        api_request,
        service_date="2026-03-05",
        room_number="102",
        guest_name="Test Guest",
        guest_count=1,
        status="served",
    )

    snidane_request = portal_request(api_base_url, "snidane@example.com", "snidane-pass")
    status, _ = snidane_request(
        f"/api/v1/breakfast/{created['id']}",
        method="PUT",
        payload={"status": "pending"},
    )
    assert status == 403

    recepce_request = portal_request(api_base_url, "recepce@example.com", "recepce-pass")
    status, data = recepce_request(
        f"/api/v1/breakfast/{created['id']}",
        method="PUT",
        payload={"status": "pending"},
    )
    assert status == 200
    assert isinstance(data, dict)
    assert data["status"] == "pending"


def test_breakfast_role_cannot_import_or_export_pdf(api_base_url: str) -> None:
    snidane_request = portal_request(api_base_url, "snidane@example.com", "snidane-pass")
    status, data = snidane_request(
        "/api/v1/breakfast/export/daily",
        params={"service_date": "2026-03-09"},
    )
    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Breakfast export requires recepce/admin role"


def test_breakfast_role_cannot_change_diet_flags(api_base_url: str, api_request: ApiRequest) -> None:
    created = create_order(api_request, service_date="2026-03-10", room_number="305")
    snidane_request = portal_request(api_base_url, "snidane@example.com", "snidane-pass")
    status, data = snidane_request(
        f"/api/v1/breakfast/{created['id']}",
        method="PUT",
        payload={"diet_no_gluten": True},
    )
    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Diet updates are limited to recepce/admin roles"


def test_reactivate_all_requires_recepce_or_admin(api_base_url: str, api_request: ApiRequest) -> None:
    create_order(api_request, service_date="2026-03-11", room_number="401", status="served")
    snidane_request = portal_request(api_base_url, "snidane@example.com", "snidane-pass")
    status, data = snidane_request(
        "/api/v1/breakfast/reactivate-all",
        method="POST",
        params={"service_date": "2026-03-11"},
    )
    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Breakfast reactivation requires recepce/admin role"

    recepce_request = portal_request(api_base_url, "recepce@example.com", "recepce-pass")
    status, _ = recepce_request(
        "/api/v1/breakfast/reactivate-all",
        method="POST",
        params={"service_date": "2026-03-11"},
    )
    assert status == 204

    status, _ = api_request(
        "/api/v1/breakfast/reactivate-all",
        method="POST",
        params={"service_date": "2026-03-11"},
    )
    assert status == 204


def test_breakfast_delete_day_requires_recepce_or_admin(api_base_url: str, api_request: ApiRequest) -> None:
    create_order(api_request, service_date="2026-03-12", room_number="401", status="pending")
    create_order(api_request, service_date="2026-03-12", room_number="402", status="served")

    snidane_request = portal_request(api_base_url, "snidane@example.com", "snidane-pass")
    status, data = snidane_request(
        "/api/v1/breakfast/day/delete",
        method="DELETE",
        params={"service_date": "2026-03-12"},
    )
    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Breakfast deletion requires recepce/admin role"

    recepce_request = portal_request(api_base_url, "recepce@example.com", "recepce-pass")
    status, _ = recepce_request(
        "/api/v1/breakfast/day/delete",
        method="DELETE",
        params={"service_date": "2026-03-12"},
    )
    assert status == 204

    status, data = api_request(
        "/api/v1/breakfast",
        params={"service_date": "2026-03-12"},
    )
    assert status == 200
    assert data == []
