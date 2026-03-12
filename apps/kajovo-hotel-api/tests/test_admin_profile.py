import json
import urllib.error
import urllib.request

from tests.test_support import admin_email, admin_password

ADMIN_EMAIL = admin_email()
ADMIN_PASSWORD = admin_password()


def _login(api_base_url: str, email: str, password: str) -> int:
    req = urllib.request.Request(
        url=f"{api_base_url}/api/auth/admin/login",
        method="POST",
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code


def test_admin_profile_read_and_password_change(api_request, api_base_url: str) -> None:
    status, profile = api_request("/api/v1/admin/profile")
    assert status == 200
    assert isinstance(profile, dict)
    assert profile["email"] == ADMIN_EMAIL

    bad_status, bad_payload = api_request(
        "/api/v1/admin/profile/password",
        method="POST",
        payload={"old_password": "wrong-pass", "new_password": "AdminPass-2026"},
    )
    assert bad_status == 401
    assert isinstance(bad_payload, dict)
    assert bad_payload["detail"] == "Invalid current password"

    ok_status, ok_payload = api_request(
        "/api/v1/admin/profile/password",
        method="POST",
        payload={"old_password": ADMIN_PASSWORD, "new_password": "AdminPass-2026"},
    )
    assert ok_status == 200
    assert isinstance(ok_payload, dict)
    assert ok_payload["ok"] is True

    old_login_status = _login(api_base_url, ADMIN_EMAIL, ADMIN_PASSWORD)
    new_login_status = _login(api_base_url, ADMIN_EMAIL, "AdminPass-2026")
    assert old_login_status == 401
    assert new_login_status == 200

    reset_status, reset_payload = api_request(
        "/api/v1/admin/profile/password",
        method="POST",
        payload={"old_password": "AdminPass-2026", "new_password": ADMIN_PASSWORD},
    )
    assert reset_status == 200
    assert isinstance(reset_payload, dict)
    assert reset_payload["ok"] is True
