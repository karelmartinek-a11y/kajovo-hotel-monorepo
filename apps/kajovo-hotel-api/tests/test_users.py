import json
import sqlite3
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path

from app.security.passwords import hash_password
from tests.test_support import admin_email, admin_login_payload, admin_password

REQUEST_TIMEOUT_SECONDS = 30
ADMIN_EMAIL = admin_email()
ADMIN_PASSWORD = admin_password()


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
        with opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
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
        payload=admin_login_payload(),
    )
    assert status == 200

    status, created = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={"email": "new.user@example.com", "roles": ["recepce"]},
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


def test_role_change_revokes_existing_portal_sessions(api_base_url: str) -> None:
    admin_jar = CookieJar()
    admin_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(admin_jar))

    status, _ = api_request(
        admin_opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert status == 200

    status, created = api_request(
        admin_opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={
            "email": "role.revoke@example.com",
            "password": "role-revoke-pass",
            "roles": ["recepce"],
        },
        headers=csrf_header(admin_jar),
    )
    assert status == 201
    assert isinstance(created, dict)
    user_id = int(created["id"])

    portal_jar = CookieJar()
    portal_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(portal_jar))
    status, _ = api_request(
        portal_opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "role.revoke@example.com", "password": "role-revoke-pass"},
    )
    assert status == 200

    status, _ = api_request(
        admin_opener,
        api_base_url,
        f"/api/v1/users/{user_id}",
        method="PATCH",
        payload={
            "first_name": "Role",
            "last_name": "Revoke",
            "email": "role.revoke@example.com",
            "roles": ["sklad"],
            "phone": None,
            "note": None,
        },
        headers=csrf_header(admin_jar),
    )
    assert status == 200

    status, denied = api_request(portal_opener, api_base_url, "/api/auth/me")
    assert status == 401
    assert isinstance(denied, dict)
    assert denied.get("detail") == "Authentication required"


def test_disabling_user_revokes_existing_portal_sessions(api_base_url: str) -> None:
    admin_jar = CookieJar()
    admin_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(admin_jar))

    status, _ = api_request(
        admin_opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert status == 200

    status, created = api_request(
        admin_opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={
            "email": "disable.revoke@example.com",
            "password": "disable-revoke-pass",
            "roles": ["recepce"],
        },
        headers=csrf_header(admin_jar),
    )
    assert status == 201
    assert isinstance(created, dict)
    user_id = int(created["id"])

    portal_jar = CookieJar()
    portal_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(portal_jar))
    status, _ = api_request(
        portal_opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "disable.revoke@example.com", "password": "disable-revoke-pass"},
    )
    assert status == 200

    status, _ = api_request(
        admin_opener,
        api_base_url,
        f"/api/v1/users/{user_id}/active",
        method="PATCH",
        payload={"is_active": False},
        headers=csrf_header(admin_jar),
    )
    assert status == 200

    status, denied = api_request(portal_opener, api_base_url, "/api/auth/me")
    assert status == 401
    assert isinstance(denied, dict)
    assert denied.get("detail") == "Authentication required"


def test_user_validation_rejects_invalid_email_and_phone(api_base_url: str) -> None:
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

    status, _ = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={"email": "neplatny-email", "password": "valid-pass-123", "roles": ["recepce"]},
        headers=csrf_header(jar),
    )
    assert status == 422

    status, _ = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={"email": "", "roles": ["recepce"]},
        headers=csrf_header(jar),
    )
    assert status == 422

    status, _ = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={"email": "kratke.heslo@example.com", "password": "kratke", "roles": ["recepce"]},
        headers=csrf_header(jar),
    )
    assert status == 422

    status, _ = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={
            "email": "valid@example.com",
            "password": "valid-pass-123",
            "roles": ["recepce"],
            "phone": "12345",
        },
        headers=csrf_header(jar),
    )
    assert status == 422


def test_portal_user_cannot_delete_users(api_base_url: str) -> None:
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

    status, created = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={"email": "portal.delete@example.com", "password": "portal-pass-123", "roles": ["recepce"]},
        headers=csrf_header(jar),
    )
    assert status == 201
    assert isinstance(created, dict)
    user_id = int(created["id"])

    portal_jar = CookieJar()
    portal_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(portal_jar))
    status, _ = api_request(
        portal_opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "portal.delete@example.com", "password": "portal-pass-123"},
    )
    assert status == 200

    status, _ = api_request(
        portal_opener,
        api_base_url,
        f"/api/v1/users/{user_id}",
        method="DELETE",
        headers=csrf_header(portal_jar),
    )
    assert status == 403


def test_admin_can_delete_user(api_base_url: str) -> None:
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

    status, created = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={"email": "delete.me@example.com", "password": "delete-user-pass", "roles": ["recepce"]},
        headers=csrf_header(jar),
    )
    assert status == 201
    assert isinstance(created, dict)
    user_id = int(created["id"])

    status, _ = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{user_id}",
        method="DELETE",
        headers=csrf_header(jar),
    )
    assert status == 204

    status, _ = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{user_id}",
    )
    assert status == 404


def test_admin_cannot_delete_own_account(api_base_url: str) -> None:
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

    admin_user_id_status, admin_user_detail = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
    )
    assert admin_user_id_status == 200
    assert isinstance(admin_user_detail, list)
    admin_user = next(
        (
            user
            for user in admin_user_detail
            if isinstance(user, dict) and user.get("email") == ADMIN_EMAIL
        ),
        None,
    )
    assert isinstance(admin_user, dict)
    admin_id = int(admin_user["id"])

    status, detail = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{admin_id}",
        method="DELETE",
        headers=csrf_header(jar),
    )
    assert status == 403
    assert isinstance(detail, dict)
    assert detail.get("detail") == "Cannot delete your own account"


def test_deactivated_admin_session_cannot_delete_remaining_admin(
    api_base_url: str,
    api_db_path: Path,
) -> None:
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
    csrf = csrf_header(jar)

    status, users = api_request(opener, api_base_url, "/api/v1/users")
    assert status == 200
    assert isinstance(users, list)
    admin_user = next(
        (
            user
            for user in users
            if isinstance(user, dict) and user.get("email") == ADMIN_EMAIL
        ),
        None,
    )
    assert isinstance(admin_user, dict)
    admin_id = int(admin_user["id"])

    last_admin_email = "solo.admin@example.com"
    hashed = hash_password("solo-admin-pass")
    new_user_id = None
    try:
        with sqlite3.connect(api_db_path) as connection:
            cursor = connection.cursor()
            cursor.execute(
                """
                INSERT INTO portal_users (first_name, last_name, email, password_hash, is_active)
                VALUES (?, ?, ?, ?, 1)
                """,
                ("Solo", "Admin", last_admin_email, hashed),
            )
            connection.commit()
            new_user_id = cursor.lastrowid
            cursor.execute(
                """
                INSERT INTO portal_user_roles (user_id, role)
                VALUES (?, 'admin')
                """,
                (new_user_id,),
            )
            connection.commit()

        status, _ = api_request(
            opener,
            api_base_url,
            f"/api/v1/users/{admin_id}/active",
            method="PATCH",
            payload={"is_active": False},
            headers=csrf,
        )
        assert status == 200

        status, detail = api_request(
            opener,
            api_base_url,
            f"/api/v1/users/{new_user_id}",
            method="DELETE",
            headers=csrf,
        )
        assert status == 401
        assert isinstance(detail, dict)
        assert detail.get("detail") == "Authentication required"
    finally:
        with sqlite3.connect(api_db_path) as connection:
            connection.execute(
                "UPDATE portal_users SET is_active = 1 WHERE id = ?",
                (admin_id,),
            )
            if new_user_id is not None:
                connection.execute("DELETE FROM portal_user_roles WHERE user_id = ?", (new_user_id,))
                connection.execute("DELETE FROM portal_users WHERE id = ?", (new_user_id,))
            connection.commit()


def test_admin_cannot_deactivate_last_active_admin(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert status == 200

    status, users = api_request(opener, api_base_url, "/api/v1/users")
    assert status == 200
    assert isinstance(users, list)
    admin_user = next(
        (
            user
            for user in users
            if isinstance(user, dict) and user.get("email") == ADMIN_EMAIL
        ),
        None,
    )
    assert isinstance(admin_user, dict)

    status, detail = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{int(admin_user['id'])}/active",
        method="PATCH",
        payload={"is_active": False},
        headers=csrf_header(jar),
    )
    assert status == 409
    assert isinstance(detail, dict)
    assert detail.get("detail") == "Cannot deactivate the last admin user"


def test_admin_cannot_remove_admin_role_from_last_admin(api_base_url: str) -> None:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/login",
        method="POST",
        payload={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert status == 200

    status, users = api_request(opener, api_base_url, "/api/v1/users")
    assert status == 200
    assert isinstance(users, list)
    admin_user = next(
        (
            user
            for user in users
            if isinstance(user, dict) and user.get("email") == ADMIN_EMAIL
        ),
        None,
    )
    assert isinstance(admin_user, dict)

    status, detail = api_request(
        opener,
        api_base_url,
        f"/api/v1/users/{int(admin_user['id'])}",
        method="PATCH",
        payload={
            "first_name": "Admin",
            "last_name": "User",
            "email": ADMIN_EMAIL,
            "roles": ["recepce"],
            "phone": None,
            "note": None,
        },
        headers=csrf_header(jar),
    )
    assert status == 409
    assert isinstance(detail, dict)
    assert detail.get("detail") == "Cannot remove admin role from the last admin user"

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
        payload=admin_login_payload(),
    )
    assert status == 200

    status, created = api_request(
        opener,
        api_base_url,
        "/api/v1/users",
        method="POST",
        payload={"email": "audit.user@example.com", "password": "audit-user-pass", "roles": ["recepce"]},
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
