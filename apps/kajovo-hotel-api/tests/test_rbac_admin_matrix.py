import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.cookiejar import CookieJar

ResponseData = dict[str, object] | list[dict[str, object]] | None


@dataclass(frozen=True)
class DenyCase:
    role: str
    email: str
    password: str
    method: str
    path: str
    expected_permission: str


def api_request(
    opener: urllib.request.OpenerDirector,
    base_url: str,
    path: str,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, ResponseData]:
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


def test_admin_endpoints_deny_matrix_for_insufficient_roles(api_base_url: str) -> None:
    deny_cases = [
        DenyCase(
            role="údržba",
            email="maintenance@example.com",
            password="maintenance-pass",
            method="GET",
            path="/api/v1/inventory",
            expected_permission="Missing permission: inventory:read",
        ),
        DenyCase(
            role="údržba",
            email="maintenance@example.com",
            password="maintenance-pass",
            method="POST",
            path="/api/v1/inventory",
            expected_permission="Missing permission: inventory:write",
        ),
        DenyCase(
            role="snídaně",
            email="snidane@example.com",
            password="snidane-pass",
            method="POST",
            path="/api/v1/inventory",
            expected_permission="Missing permission: inventory:write",
        ),
        DenyCase(
            role="snídaně",
            email="snidane@example.com",
            password="snidane-pass",
            method="POST",
            path="/api/v1/reports",
            expected_permission="Missing permission: reports:write",
        ),
        DenyCase(
            role="recepce",
            email="reception@example.com",
            password="reception-pass",
            method="GET",
            path="/api/v1/users",
            expected_permission="Missing actor type: admin",
        ),
        DenyCase(
            role="recepce",
            email="reception@example.com",
            password="reception-pass",
            method="POST",
            path="/api/v1/users",
            expected_permission="Missing actor type: admin",
        ),
    ]

    for case in deny_cases:
        jar = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        status, _ = api_request(
            opener,
            api_base_url,
            "/api/auth/login",
            method="POST",
            payload={"email": case.email, "password": case.password},
        )
        assert status == 200

        payload = {"name": "Mýdlo", "unit": "ks", "min_stock": 1, "current_stock": 3}
        if case.path == "/api/v1/reports":
            payload = {"title": "No access", "status": "open"}
        if case.path == "/api/v1/users":
            payload = {"email": "blocked.user@example.com", "password": "blocked-user-pass"}

        status, data = api_request(
            opener,
            api_base_url,
            case.path,
            method=case.method,
            payload=payload if case.method == "POST" else None,
            headers=csrf_header(jar) if case.method == "POST" else None,
        )

        assert status == 403
        assert isinstance(data, dict)
        assert data["detail"] == case.expected_permission
