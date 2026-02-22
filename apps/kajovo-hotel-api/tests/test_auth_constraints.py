import json
import urllib.error
import urllib.request
from http.cookiejar import CookieJar


def csrf_header(cookie_jar: CookieJar) -> dict[str, str]:
    token = next((cookie.value for cookie in cookie_jar if cookie.name == "kajovo_csrf"), "")
    return {"x-csrf-token": token} if token else {}


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


def test_admin_password_change_endpoint_is_not_available(api_base_url: str) -> None:
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

    status, _ = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/password",
        method="POST",
        payload={"old_password": "admin123", "new_password": "new-admin-pass"},
        headers=csrf_header(jar),
    )
    assert status == 404


def test_admin_hint_endpoint_is_stable(api_base_url: str) -> None:
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
    status, body = api_request(
        opener,
        api_base_url,
        "/api/auth/admin/hint",
        method="POST",
        payload={"email": "admin@kajovohotel.local"},
        headers=csrf_header(jar),
    )
    assert status == 200
    assert body == {"ok": True}
