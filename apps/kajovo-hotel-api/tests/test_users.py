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


def test_admin_can_crud_and_portal_login(api_base_url: str) -> None:
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

    status, created = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={"email": "new.user@example.com", "password": "new-user-pass"},
        headers=csrf_header(jar),
    )
    assert status == 201
    assert isinstance(created, dict)
    user_id = int(created["id"])

    status, users = api_request(opener, api_base_url, "/api/v1/users")
    assert status == 200
    assert isinstance(users, list)
    assert any(
        isinstance(user, dict) and user.get("email") == "new.user@example.com" for user in users
    )

    status, detail = api_request(opener, api_base_url, f"/api/v1/users/{user_id}")
    assert status == 200
    assert isinstance(detail, dict)
    assert detail["email"] == "new.user@example.com"

    status, updated = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{user_id}",
        method="PATCH",
        payload={
            "first_name": "Novy",
            "last_name": "Uzivatel",
            "email": "new.user@example.com",
            "roles": ["recepce", "snídaně"],
            "phone": "+420123456789",
            "note": "Poznamka",
        },
        headers=csrf_header(jar),
    )
    assert status == 200
    assert isinstance(updated, dict)
    assert updated["phone"] == "+420123456789"
    assert "recepce" in updated["roles"]

    status, reset_link = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{user_id}/password/reset-link",
        method="POST",
        headers=csrf_header(jar),
    )
    assert status == 200
    assert reset_link == {"ok": True}

    status, disabled = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{user_id}/active",
        method="PATCH",
        payload={"is_active": False},
        headers=csrf_header(jar),
    )
    assert status == 200
    assert isinstance(disabled, dict)
    assert disabled["is_active"] is False

    status, _ = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{user_id}/active",
        method="PATCH",
        payload={"is_active": True},
        headers=csrf_header(jar),
    )
    assert status == 200

    status, _ = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{user_id}/password/reset",
        method="POST",
        payload={"password": "reset-user-pass"},
        headers=csrf_header(jar),
    )
    assert status == 200

    portal_jar = CookieJar()
    portal_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(portal_jar))
    status, identity = api_request(
        portal_opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "new.user@example.com", "password": "reset-user-pass"},
    )
    assert status == 200
    assert isinstance(identity, dict)
    assert identity["email"] == "new.user@example.com"


def test_password_not_logged_in_audit_detail(
    api_base_url: str, api_db_path: Path
) -> None:
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

    status, created = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={"email": "audit.user@example.com", "password": "audit-user-pass"},
        headers=csrf_header(jar),
    )
    assert status == 201
    assert isinstance(created, dict)
    user_id = int(created["id"])

    status, _ = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{user_id}/password",
        method="POST",
        payload={"password": "audit-user-new-pass"},
        headers=csrf_header(jar),
    )
    assert status == 200

    db_path = api_db_path
    with sqlite3.connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT detail
            FROM audit_trail
            WHERE resource = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (f"/api/v1/users/{user_id}/password",),
        ).fetchone()

    assert row is not None
    assert "audit-user-new-pass" not in row[0]
    assert '"password_action": "set"' in row[0]
