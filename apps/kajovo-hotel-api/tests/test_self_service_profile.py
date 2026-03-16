import json
import urllib.error
import urllib.request
from collections.abc import Callable
from http.cookiejar import CookieJar

ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]


def csrf_header(cookie_jar: CookieJar) -> dict[str, str]:
    token = next((cookie.value for cookie in cookie_jar if cookie.name == "kajovo_csrf"), "")
    return {"x-csrf-token": token} if token else {}


def raw_request(
    opener: urllib.request.OpenerDirector,
    base_url: str,
    path: str,
    *,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, ResponseData]:
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


def login(base_url: str, email: str, password: str, *, admin: bool) -> tuple[urllib.request.OpenerDirector, CookieJar]:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    path = "/api/auth/admin/login" if admin else "/api/auth/login"
    status, _ = raw_request(
        opener,
        base_url,
        path,
        method="POST",
        payload={"email": email, "password": password},
    )
    assert status == 200
    return opener, jar


def test_admin_role_user_can_access_admin_surface_but_cannot_change_password(
    api_request: ApiRequest, api_base_url: str
) -> None:
    admin_email = "profile.admin@example.com"
    admin_password = "ProfileAdmin123"
    status, created = api_request(
        "/api/v1/users",
        method="POST",
        payload={
            "first_name": "Profile",
            "last_name": "Admin",
            "email": admin_email,
            "password": admin_password,
            "roles": ["admin"],
        },
    )
    assert status == 201
    assert isinstance(created, dict)

    opener, jar = login(api_base_url, admin_email, admin_password, admin=True)

    status, profile = raw_request(opener, api_base_url, "/api/auth/profile")
    assert status == 200
    assert isinstance(profile, dict)
    assert profile["email"] == admin_email
    assert profile["roles"] == ["admin"]

    status, updated = raw_request(
        opener,
        api_base_url,
        "/api/auth/profile",
        method="PATCH",
        payload={
            "first_name": "Updated",
            "last_name": "Admin",
            "phone": "+420777888999",
            "note": "Self service admin",
        },
        headers=csrf_header(jar),
    )
    assert status == 200
    assert isinstance(updated, dict)
    assert updated["first_name"] == "Updated"
    assert updated["phone"] == "+420777888999"

    status, body = raw_request(
        opener,
        api_base_url,
        "/api/auth/change-password",
        method="POST",
        payload={"old_password": admin_password, "new_password": "ProfileAdmin456"},
        headers=csrf_header(jar),
    )
    assert status == 409
    assert isinstance(body, dict)
    assert body["detail"] == "Admin account password reminder is handled only via admin login hint"

    status, me = raw_request(opener, api_base_url, "/api/auth/me")
    assert status == 200
    assert isinstance(me, dict)
    assert me["email"] == admin_email

    cleanup_status, cleanup_body = api_request(
        f"/api/v1/users/{int(created['id'])}",
        method="DELETE",
    )
    assert cleanup_status == 204
    assert cleanup_body is None


def test_portal_self_service_profile_and_password_change(
    api_request: ApiRequest, api_base_url: str
) -> None:
    email = "profile.portal@example.com"
    password = "ProfilePortal123"
    status, created = api_request(
        "/api/v1/users",
        method="POST",
        payload={
            "first_name": "Portal",
            "last_name": "User",
            "email": email,
            "password": password,
            "roles": ["recepce"],
        },
    )
    assert status == 201
    assert isinstance(created, dict)

    opener, jar = login(api_base_url, email, password, admin=False)

    status, profile = raw_request(opener, api_base_url, "/api/auth/profile")
    assert status == 200
    assert isinstance(profile, dict)
    assert profile["email"] == email
    assert profile["roles"] == ["recepce"]

    status, updated = raw_request(
        opener,
        api_base_url,
        "/api/auth/profile",
        method="PATCH",
        payload={
            "first_name": "Portal Updated",
            "last_name": "User",
            "phone": "+420601123456",
            "note": "Portal self service",
        },
        headers=csrf_header(jar),
    )
    assert status == 200
    assert isinstance(updated, dict)
    assert updated["first_name"] == "Portal Updated"
    assert updated["phone"] == "+420601123456"

    status, body = raw_request(
        opener,
        api_base_url,
        "/api/auth/change-password",
        method="POST",
        payload={"old_password": password, "new_password": "ProfilePortal456"},
        headers=csrf_header(jar),
    )
    assert status == 200
    assert body == {"ok": True}

    status, denied = raw_request(opener, api_base_url, "/api/auth/me")
    assert status == 401
    assert isinstance(denied, dict)
    assert denied["detail"] == "Authentication required"

    new_opener, _ = login(api_base_url, email, "ProfilePortal456", admin=False)
    status, me = raw_request(new_opener, api_base_url, "/api/auth/me")
    assert status == 200
    assert isinstance(me, dict)
    assert me["email"] == email

    cleanup_status, cleanup_body = api_request(
        f"/api/v1/users/{int(created['id'])}",
        method="DELETE",
    )
    assert cleanup_status == 204
    assert cleanup_body is None
