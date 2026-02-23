import json
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from http.cookiejar import CookieJar
from pathlib import Path


def api_request(
    opener: urllib.request.OpenerDirector,
    base_url: str,
    path: str,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, object] | None]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request_headers = headers.copy() if headers else {}
    if payload is not None:
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url=f"{base_url}{path}",
        data=data,
        headers=request_headers,
        method=method,
    )
    try:
        with opener.open(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else None


def test_admin_lockout_has_generic_response(api_base_url: str, api_db_path: Path) -> None:
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    with sqlite3.connect(api_db_path) as connection:
        connection.execute("DELETE FROM auth_unlock_tokens")
        connection.execute("DELETE FROM auth_lockout_states")
        connection.execute(
            """
            INSERT OR REPLACE INTO auth_lockout_states
            (id, actor_type, principal, failed_attempts, first_failed_at, last_failed_at, locked_until)
            VALUES (
              COALESCE((SELECT id FROM auth_lockout_states WHERE actor_type = 'admin' AND principal = ?), NULL),
              'admin', ?, 3, ?, ?, ?
            )
            """,
            (
                "admin@kajovohotel.local",
                "admin@kajovohotel.local",
                datetime.utcnow().isoformat(),
                datetime.utcnow().isoformat(),
                (datetime.utcnow() + timedelta(minutes=30)).isoformat(),
            ),
        )
        connection.commit()

    status_locked, body_locked = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": "admin@kajovohotel.local", "password": "admin123"},
    )
    assert status_locked == 401
    assert isinstance(body_locked, dict)
    assert body_locked.get("detail") == "Invalid credentials"

    status_wrong, body_wrong = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": "admin@kajovohotel.local", "password": "wrong-pass"},
    )
    assert status_wrong == 401
    assert isinstance(body_wrong, dict)
    assert body_wrong.get("detail") == body_locked.get("detail")

    with sqlite3.connect(api_db_path) as connection:
        connection.execute("DELETE FROM auth_unlock_tokens")
        connection.execute("DELETE FROM auth_lockout_states")
        connection.commit()

    status_ok, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": "admin@kajovohotel.local", "password": "admin123"},
    )
    assert status_ok == 200


def test_admin_hint_rate_limited_to_once_per_hour(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": "admin@kajovohotel.local", "password": "admin123"},
    )
    assert status == 200

    token = next((cookie.value for cookie in jar if cookie.name == "kajovo_csrf"), "")
    headers = {"x-csrf-token": token} if token else {}

    status, body = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/hint",
        method="POST",
        payload={"email": "admin@kajovohotel.local"},
        headers=headers,
    )
    assert status == 200
    assert body == {"ok": True}

    status, body = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/hint",
        method="POST",
        payload={"email": "admin@kajovohotel.local"},
        headers=headers,
    )
    assert status == 200
    assert body == {"ok": True}
