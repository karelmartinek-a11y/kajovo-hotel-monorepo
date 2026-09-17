import json
import sqlite3
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path


def api_request(
    opener: urllib.request.OpenerDirector,
    base_url: str,
    path: str,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, object] | list[dict[str, object]] | None]:
    url = f"{base_url}{path}"
    data = None
    request_headers = headers.copy() if headers else {}

    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        request_headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url=url, data=data, headers=request_headers, method=method)
    try:
        with opener.open(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        parsed = json.loads(raw) if raw else None
        return exc.code, parsed


def csrf_header(cookie_jar: CookieJar) -> dict[str, str]:
    token = next((cookie.value for cookie in cookie_jar if cookie.name == "kajovo_csrf"), "")
    return {"x-csrf-token": token} if token else {}


def test_rbac_allows_inventory_for_sklad(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "sklad@example.com", "password": "sklad-pass"},
    )
    assert status == 200

    status, data = api_request(opener, api_base_url, "/api/v1/inventory")
    assert status == 200
    assert isinstance(data, list)


def test_rbac_denies_lost_found_for_sklad(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "sklad@example.com", "password": "sklad-pass"},
    )
    assert status == 200

    status, data = api_request(opener, api_base_url, "/api/v1/lost-found")

    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Missing permission: lost_found:read"


def test_rbac_denies_breakfast_for_sklad(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "sklad@example.com", "password": "sklad-pass"},
    )
    assert status == 200

    status, data = api_request(opener, api_base_url, "/api/v1/breakfast")

    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Missing permission: breakfast:read"


def test_rbac_housekeeping_rooms_are_readable_and_writable_by_housekeeping(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "pokojska@example.com", "password": "pokojska-pass"},
    )
    assert status == 200

    status, _ = api_request(opener, api_base_url, "/api/v1/housekeeping/rooms?date=2026-09-17")
    assert status == 502
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/v1/housekeeping/rooms/room-101?date=2026-09-17",
        method="PATCH",
        payload={"status": "clean"},
        headers=csrf_header(jar),
    )
    assert status == 502


def test_rbac_housekeeping_rooms_are_allowed_to_reception(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "recepce@example.com", "password": "recepce-pass"},
    )
    assert status == 200

    status, data = api_request(opener, api_base_url, "/api/v1/housekeeping/rooms?date=2026-09-17")
    assert status == 502  # Access accepted; test server has no Better Hotel credentials.


def test_housekeeping_amenities_enforce_role_and_csrf_before_upstream(api_base_url: str) -> None:
    path = "/api/v1/housekeeping/reservations/r/amenities/dog?room_id=101&date=2026-09-17&version=1"
    for role in ("pokojska", "recepce", "sklad"):
        jar = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        code, _ = api_request(opener, api_base_url, "/api/auth/login", method="POST",
                             payload={"email": f"{role}@example.com", "password": f"{role}-pass"})
        assert code == 200
        for method in ("POST", "DELETE", "PATCH"):
            payload = {"state": "green", "version": 1} if method == "PATCH" else None
            code, _ = api_request(opener, api_base_url, path, method=method, payload=payload)
            assert code == 403
            code, _ = api_request(opener, api_base_url, path, method=method, payload=payload, headers=csrf_header(jar))
            allowed = role == "recepce" or (role == "pokojska" and method == "PATCH")
            assert code == (502 if allowed else 403)


def test_rbac_allows_reports_for_recepce(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "recepce@example.com", "password": "recepce-pass"},
    )
    assert status == 200

    status, data = api_request(opener, api_base_url, "/api/v1/reports")
    assert status == 200
    assert isinstance(data, list)


def test_rbac_allows_reports_read_for_sklad(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "sklad@example.com", "password": "sklad-pass"},
    )
    assert status == 200

    status, data = api_request(opener, api_base_url, "/api/v1/reports")
    assert status == 200
    assert isinstance(data, list)


def test_rbac_write_denied_is_audited_with_actor_identity(
    api_base_url: str, api_db_path: Path
) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "udrzba@example.com", "password": "udrzba-pass"},
    )
    assert status == 200

    status, data = api_request(
        opener,
        api_base_url,
        "/api/v1/reports",
        method="POST",
        payload={"title": "No access", "status": "open"},
        headers=csrf_header(jar),
    )

    assert status == 403
    assert isinstance(data, dict)

    db_path = api_db_path
    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT actor, actor_id, actor_role, action, resource, status_code
            FROM audit_trail
            WHERE actor_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            ("udrzba@example.com",),
        ).fetchone()

    assert row is not None
    assert row[0] == "udrzba@example.com"
    assert row[1] == "udrzba@example.com"
    assert row[2] == "maintenance"
    assert row[3] == "POST"
    assert row[4] == "/api/v1/reports"
    assert row[5] == 403
