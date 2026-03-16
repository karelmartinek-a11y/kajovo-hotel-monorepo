import json
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path


def raw_request(
    opener: urllib.request.OpenerDirector,
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, object] | list[dict[str, object]] | None]:
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
        with opener.open(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else None


def csrf_header(cookie_jar: CookieJar) -> dict[str, str]:
    token = next((cookie.value for cookie in cookie_jar if cookie.name == "kajovo_csrf"), "")
    return {"x-csrf-token": token} if token else {}


def _capture_messages(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def test_admin_can_issue_password_reset_link_and_user_can_finish_reset(
    api_request,
    api_base_url: str,
    api_db_path: Path,
    api_mail_capture_path: Path,
) -> None:
    email = "self.reset@example.com"
    old_password = "SelfReset123"
    new_password = "SelfReset456"

    created_status, created = api_request(
        "/api/v1/users",
        method="POST",
        payload={
            "first_name": "Self",
            "last_name": "Reset",
            "email": email,
            "password": old_password,
            "roles": ["recepce"],
        },
    )
    assert created_status == 201
    assert isinstance(created, dict)
    user_id = int(created["id"])

    before_messages = _capture_messages(api_mail_capture_path)

    reset_link_status, reset_link_body = api_request(
        f"/api/v1/users/{user_id}/password/reset-link",
        method="POST",
    )
    assert reset_link_status == 200
    assert isinstance(reset_link_body, dict)
    assert reset_link_body.get("ok") is True

    after_messages = _capture_messages(api_mail_capture_path)
    new_messages = after_messages[len(before_messages):]
    reset_mail = next(
        (
            message
            for message in reversed(new_messages)
            if message.get("recipient") == email and "reset hesla" in str(message.get("subject", "")).lower()
        ),
        None,
    )
    assert isinstance(reset_mail, dict)

    body = str(reset_mail.get("body", ""))
    start = body.find("/login/reset?")
    assert start >= 0
    reset_path = body[start:].split()[0]
    token = urllib.parse.parse_qs(urllib.parse.urlparse(reset_path).query).get("token", [""])[0]
    assert len(token) >= 16

    anonymous_jar = CookieJar()
    anonymous_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(anonymous_jar))
    reset_status, reset_body = raw_request(
        anonymous_opener,
        api_base_url,
        "/api/auth/reset-password",
        method="POST",
        payload={"token": token, "new_password": new_password},
    )
    assert reset_status == 200
    assert reset_body == {"ok": True}

    stale_status, stale_body = raw_request(
        anonymous_opener,
        api_base_url,
        "/api/auth/reset-password",
        method="POST",
        payload={"token": token, "new_password": "AnotherPass789"},
    )
    assert stale_status == 400
    assert isinstance(stale_body, dict)
    assert stale_body.get("detail") == "Invalid token"

    old_login_status, old_login_body = raw_request(
        anonymous_opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": email, "password": old_password},
    )
    assert old_login_status == 401
    assert isinstance(old_login_body, dict)
    assert old_login_body.get("detail") == "Invalid credentials"

    fresh_jar = CookieJar()
    fresh_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(fresh_jar))
    new_login_status, new_login_body = raw_request(
        fresh_opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": email, "password": new_password},
    )
    assert new_login_status == 200
    assert isinstance(new_login_body, dict)
    assert new_login_body.get("email") == email

    with sqlite3.connect(api_db_path) as connection:
        token_row = connection.execute(
            """
            SELECT purpose, used_at
            FROM auth_unlock_tokens
            WHERE actor_type = 'portal' AND principal = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (email,),
        ).fetchone()
        assert token_row is not None
        assert token_row[0] == "password_reset"
        assert token_row[1] is not None

        audit_row = connection.execute(
            """
            SELECT detail
            FROM audit_trail
            WHERE resource = '/api/auth/reset-password'
              AND status_code = 200
            ORDER BY id DESC
            LIMIT 1
            """
        ).fetchone()
        assert audit_row is not None
        assert new_password not in audit_row[0]
        assert '"password_action": "admin_link_reset"' in audit_row[0]
        assert f'"user_id": {user_id}' in audit_row[0]
