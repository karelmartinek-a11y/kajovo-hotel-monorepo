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


def test_rbac_allows_inventory_for_warehouse(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "snidane@example.com", "password": "snidane-pass"},
    )
    assert status == 200

    status, data = api_request(opener, api_base_url, "/api/v1/inventory", headers=csrf_header(jar))
    assert status == 200
    assert isinstance(data, list)


def test_rbac_denies_breakfast_for_warehouse(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "maintenance@example.com", "password": "maintenance-pass"},
    )
    assert status == 200

    status, data = api_request(opener, api_base_url, "/api/v1/breakfast", headers=csrf_header(jar))

    assert status == 403
    assert isinstance(data, dict)
    assert data["detail"] == "Missing permission: breakfast:read"


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
        payload={"email": "maintenance@example.com", "password": "maintenance-pass"},
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
            ("maintenance@example.com",),
        ).fetchone()

    assert row is not None
    assert row[0] == "maintenance@example.com"
    assert row[1] == "maintenance@example.com"
    assert row[2] == "údržba"
    assert row[3] == "POST"
    assert row[4] == "/api/v1/reports"
    assert row[5] == 403
