import json
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from datetime import date, datetime
from http.cookiejar import CookieJar
from zoneinfo import ZoneInfo

from app.api.routes.breakfast import _can_mark_served

ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

def csrf_header(cookie_jar: CookieJar) -> dict[str, str]:
    token = next((cookie.value for cookie in cookie_jar if cookie.name == "kajovo_csrf"), "")
    return {"x-csrf-token": token} if token else {}


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


def test_breakfast_daily_list_is_sorted_by_room(api_request: ApiRequest) -> None:
    create_order(
        api_request,
        service_date="2026-02-23",
        room_number="305",
        guest_count=2,
        status="pending",
    )
    create_order(
        api_request,
        service_date="2026-02-23",
        room_number="101",
        guest_count=1,
        status="pending",
    )
    create_order(
        api_request,
        service_date="2026-02-23",
        room_number="204",
        guest_count=1,
        status="served",
    )
    create_order(
        api_request,
        service_date="2026-02-23",
        room_number="099",
        guest_count=1,
        status="cancelled",
    )
    status, data = api_request(
        "/api/v1/breakfast",
        params={"service_date": "2026-02-23"},
    )
    assert status == 200
    assert isinstance(data, list)
    assert [item["room_number"] for item in data] == ["099", "101", "204", "305"]


def test_update_and_delete_breakfast_order(api_request: ApiRequest) -> None:
    created = create_order(api_request)

    status, updated = api_request(
        f"/api/v1/breakfast/{created['id']}",
        method="PUT",
        payload={"status": "preparing"},
    )

    assert status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "preparing"
    assert updated["note"] is None

    rejected_status, _ = api_request(f"/api/v1/breakfast/{created['id']}", method="PUT", payload={"note": "Vlastní poznámka"})
    assert rejected_status == 422

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


def test_removed_breakfast_import_and_manual_refresh_routes(api_request: ApiRequest) -> None:
    for path in ("/api/v1/breakfast/import", "/api/v1/breakfast/manual-refresh", "/api/v1/admin/settings/breakfast-import-run"):
        status, _ = api_request(path, method="POST", payload={})
        assert status in {404, 405}


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
            from io import BytesIO

            from pypdf import PdfReader

            assert "Datum: 2026-03-09" in PdfReader(BytesIO(content)).pages[0].extract_text()
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

    status, data = api_request(
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


def test_reactivate_all_requires_admin(api_base_url: str, api_request: ApiRequest) -> None:
    create_order(api_request, service_date="2026-03-11", room_number="401", status="served")
    snidane_request = portal_request(api_base_url, "snidane@example.com", "snidane-pass")
    status, data = snidane_request(
        "/api/v1/breakfast/reactivate-all",
        method="POST",
        params={"service_date": "2026-03-11"},
    )
    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Breakfast reactivation requires admin role"

    recepce_request = portal_request(api_base_url, "recepce@example.com", "recepce-pass")
    status, data = recepce_request(
        "/api/v1/breakfast/reactivate-all",
        method="POST",
        params={"service_date": "2026-03-11"},
    )
    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Breakfast reactivation requires admin role"

    status, _ = api_request(
        "/api/v1/breakfast/reactivate-all",
        method="POST",
        params={"service_date": "2026-03-11"},
    )
    assert status == 204


def test_breakfast_serving_time_rules() -> None:
    tz = ZoneInfo("Europe/Prague")
    today = date(2026, 7, 21)

    assert _can_mark_served("recepce", today, datetime(2026, 7, 21, 5, 0, tzinfo=tz))
    assert _can_mark_served("snídaně", today, datetime(2026, 7, 21, 11, 0, tzinfo=tz))
    assert not _can_mark_served("recepce", today, datetime(2026, 7, 21, 11, 1, tzinfo=tz))
    assert not _can_mark_served("snídaně", date(2026, 7, 20), datetime(2026, 7, 21, 6, 0, tzinfo=tz))
    assert _can_mark_served("admin", date(2026, 7, 20), datetime(2026, 7, 21, 1, 0, tzinfo=tz))


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


def test_breakfast_delete_period_requires_admin(api_base_url: str, api_request: ApiRequest) -> None:
    create_order(api_request, service_date="2026-03-13", room_number="401", status="pending")
    create_order(api_request, service_date="2026-03-14", room_number="402", status="served")
    create_order(api_request, service_date="2026-03-15", room_number="403", status="pending")

    recepce_request = portal_request(api_base_url, "recepce@example.com", "recepce-pass")
    status, data = recepce_request(
        "/api/v1/breakfast/period/delete",
        method="DELETE",
        params={"date_from": "2026-03-13", "date_to": "2026-03-14"},
    )
    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Breakfast period deletion requires admin role"

    status, data = api_request(
        "/api/v1/breakfast/period/delete",
        method="DELETE",
        params={"date_from": "2026-03-15", "date_to": "2026-03-14"},
    )
    assert status == 400
    assert isinstance(data, dict)
    assert data["detail"] == "Date from must be before or equal to date to"

    status, _ = api_request(
        "/api/v1/breakfast/period/delete",
        method="DELETE",
        params={"date_from": "2026-03-13", "date_to": "2026-03-14"},
    )
    assert status == 204

    status, first_day = api_request("/api/v1/breakfast", params={"service_date": "2026-03-13"})
    assert status == 200
    assert first_day == []

    status, second_day = api_request("/api/v1/breakfast", params={"service_date": "2026-03-14"})
    assert status == 200
    assert second_day == []

    status, third_day = api_request("/api/v1/breakfast", params={"service_date": "2026-03-15"})
    assert status == 200
    assert len(third_day) == 1
