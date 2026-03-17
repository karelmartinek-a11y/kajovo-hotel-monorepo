import json
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http.cookiejar import CookieJar
from pathlib import Path

from tests.test_support import admin_email, admin_login_payload, admin_password

ADMIN_EMAIL = admin_email()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
            (
              id,
              actor_type,
              principal,
              failed_attempts,
              first_failed_at,
              last_failed_at,
              locked_until
            )
            VALUES (
              COALESCE(
                (
                  SELECT id FROM auth_lockout_states
                  WHERE actor_type = 'admin' AND principal = ?
                ),
                NULL
              ),
              'admin', ?, 3, ?, ?, ?
            )
            """,
            (
                ADMIN_EMAIL,
                ADMIN_EMAIL,
                _utc_now_iso(),
                _utc_now_iso(),
                (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
            ),
        )
        connection.commit()

    status_locked, body_locked = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": ADMIN_EMAIL, "password": "wrong-pass"},
    )
    assert status_locked == 423
    assert isinstance(body_locked, dict)
    assert body_locked.get("detail") == "Account locked"

    status_wrong, body_wrong = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": ADMIN_EMAIL, "password": "another-wrong-pass"},
    )
    assert status_wrong == 423
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
        payload=admin_login_payload(),
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
        payload=admin_login_payload(),
    )
    assert status == 200

    token = next((cookie.value for cookie in jar if cookie.name == "kajovo_csrf"), "")
    headers = {"x-csrf-token": token} if token else {}

    status, body = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/hint",
        method="POST",
        payload={"email": ADMIN_EMAIL},
        headers=headers,
    )
    assert status == 200
    assert body == {
        "ok": True,
        "connected": True,
        "send_attempted": True,
        "message": f"Připomenutí bylo odesláno na {ADMIN_EMAIL}.",
    }

    throttled_status, throttled_body = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/hint",
        method="POST",
        payload={"email": ADMIN_EMAIL},
        headers=headers,
    )
    assert throttled_status == 200
    assert throttled_body == {
        "ok": True,
        "connected": False,
        "send_attempted": False,
        "message": "Připomenutí už bylo nedávno odesláno. Další pokus zatím neproběhl.",
    }


def test_admin_hint_supports_admin_role_user_email(api_base_url: str, api_mail_capture_path: Path) -> None:
    admin_jar = CookieJar()
    admin_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(admin_jar))

    status, _ = api_request(
        admin_opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload=admin_login_payload(),
    )
    assert status == 200

    token = next((cookie.value for cookie in admin_jar if cookie.name == "kajovo_csrf"), "")
    headers = {"x-csrf-token": token} if token else {}

    created_status, created_body = api_request(
        admin_opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={
            "first_name": "Admin",
            "last_name": "Role",
            "email": "admin.role@example.com",
            "password": "AdminRole123",
            "roles": ["admin"],
        },
        headers=headers,
    )
    assert created_status == 201
    assert isinstance(created_body, dict)
    user_id = int(created_body["id"])

    before_messages = [
        json.loads(line)
        for line in api_mail_capture_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]

    status, body = api_request(
        admin_opener,
        api_base_url,
        "/api/auth/admin/hint",
        method="POST",
        payload={"email": "admin.role@example.com"},
        headers=headers,
    )
    assert status == 200
    assert body == {
        "ok": True,
        "connected": True,
        "send_attempted": True,
        "message": "Připomenutí bylo odesláno na admin.role@example.com.",
    }

    after_messages = [
        json.loads(line)
        for line in api_mail_capture_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    new_messages = after_messages[len(before_messages):]
    assert any(
        message.get("recipient") == "admin.role@example.com"
        and "připomenutí admin hesla" in str(message.get("subject", "")).lower()
        for message in new_messages
    )

    deleted_status, deleted_body = api_request(
        admin_opener,
        api_base_url,
        f"/api/v1/users/{user_id}",
        method="DELETE",
        headers=headers,
    )
    assert deleted_status == 204
    assert deleted_body is None


def test_failed_admin_logins_issue_unlock_token(api_base_url: str, api_db_path: Path, api_mail_capture_path: Path) -> None:
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    with sqlite3.connect(api_db_path) as connection:
        connection.execute("DELETE FROM auth_unlock_tokens")
        connection.execute("DELETE FROM auth_lockout_states")
        connection.commit()

    for _ in range(3):
        status, _ = api_request(
            opener,
            api_base_url,
            "/api/auth/admin/login",
            method="POST",
            payload={"email": ADMIN_EMAIL, "password": "wrong-pass"},
        )
    assert status == 401

    with sqlite3.connect(api_db_path) as connection:
        row = connection.execute(
            "SELECT token_hash, purpose FROM auth_unlock_tokens WHERE actor_type = 'admin' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        assert row is not None
        assert row[1] == "unlock"

    messages = [
        json.loads(line)
        for line in api_mail_capture_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert any(message.get("recipient") == ADMIN_EMAIL and "odblok" in str(message.get("body", "")).lower() for message in messages)

    bad_status, _ = api_request(opener, api_base_url, "/api/auth/unlock?token=bad-token")
    assert bad_status == 400


def test_duplicate_lockout_rows_are_collapsed_during_auth(api_base_url: str, api_db_path: Path) -> None:
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    principal = ADMIN_EMAIL

    with sqlite3.connect(api_db_path) as connection:
        connection.execute("DELETE FROM auth_lockout_states WHERE actor_type = 'admin' AND principal = ?", (principal,))
        first_failed_at = _utc_now_iso()
        second_failed_at = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        locked_until = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
        connection.execute(
            """
            INSERT INTO auth_lockout_states
            (actor_type, principal, failed_attempts, first_failed_at, last_failed_at, locked_until)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "admin",
                principal,
                3,
                first_failed_at,
                first_failed_at,
                locked_until,
            ),
        )
        connection.execute(
            """
            INSERT INTO auth_lockout_states
            (actor_type, principal, failed_attempts, first_failed_at, last_failed_at, locked_until)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "admin",
                principal,
                2,
                second_failed_at,
                second_failed_at,
                locked_until,
            ),
        )
        connection.commit()

    status_ok, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": ADMIN_EMAIL, "password": admin_password()},
    )
    assert status_ok == 200

    with sqlite3.connect(api_db_path) as connection:
        remaining = connection.execute(
            """
            SELECT COUNT(*)
            FROM auth_lockout_states
            WHERE actor_type = 'admin' AND principal = ?
            """,
            (principal,),
        ).fetchone()
        assert remaining is not None
        assert int(remaining[0]) == 1

        row = connection.execute(
            """
            SELECT failed_attempts, locked_until
            FROM auth_lockout_states
            WHERE actor_type = 'admin' AND principal = ?
            """,
            (ADMIN_EMAIL,),
        ).fetchone()
    assert row is not None
    assert int(row[0]) == 0
    assert row[1] is None
