import json
import urllib.error
import urllib.request
from http.cookiejar import CookieJar


def raw_request(opener, base_url: str, path: str, method: str = "GET", payload: dict[str, object] | None = None, headers: dict[str, str] | None = None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req_headers = headers.copy() if headers else {}
    if payload is not None:
        req_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{base_url}{path}", data=data, headers=req_headers, method=method)
    try:
        with opener.open(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else None


def csrf_header(jar: CookieJar) -> dict[str, str]:
    token = next((c.value for c in jar if c.name == "kajovo_csrf"), "")
    return {"x-csrf-token": token} if token else {}


def test_multi_role_user_must_select_active_role(api_base_url: str, api_request) -> None:
    status, created = api_request(
        "/api/v1/users",
        method="POST",
        payload={
            "first_name": "Role",
            "last_name": "Picker",
            "email": "multi.role@example.com",
            "password": "multi-role-pass",
            "roles": ["recepce", "snídaně"],
        },
    )
    assert status == 201
    assert isinstance(created, dict)

    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    status, login = raw_request(
        opener,
        api_base_url,
        "/api/auth/login",
        method="POST",
        payload={"email": "multi.role@example.com", "password": "multi-role-pass"},
    )
    assert status == 200
    assert isinstance(login, dict)
    assert login.get("active_role") is None

    status, me = raw_request(opener, api_base_url, "/api/auth/me")
    assert status == 200
    assert isinstance(me, dict)
    assert me.get("active_role") is None
    assert me.get("permissions") == []

    status, denied = raw_request(opener, api_base_url, "/api/v1/reports")
    assert status == 403
    assert isinstance(denied, dict)

    status, selected = raw_request(
        opener,
        api_base_url,
        "/api/auth/select-role",
        method="POST",
        payload={"role": "recepce"},
        headers=csrf_header(jar),
    )
    assert status == 200
    assert isinstance(selected, dict)
    assert selected.get("active_role") == "recepce"

    status, me_after = raw_request(opener, api_base_url, "/api/auth/me")
    assert status == 200
    assert isinstance(me_after, dict)
    assert me_after.get("active_role") == "recepce"
