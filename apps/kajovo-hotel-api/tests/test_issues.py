import json
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Callable
from http.cookiejar import CookieJar

ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]


def csrf_header(cookie_jar: CookieJar) -> dict[str, str]:
    token = next((cookie.value for cookie in cookie_jar if cookie.name == "kajovo_csrf"), "")
    return {"x-csrf-token": token} if token else {}


def build_multipart(files: list[tuple[str, str, bytes]]) -> tuple[bytes, str]:
    boundary = f"----kajovo{uuid.uuid4().hex}"
    body = bytearray()
    for field_name, filename, content in files:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode(
                "utf-8"
            )
        )
        body.extend(b"Content-Type: image/jpeg\r\n\r\n")
        body.extend(content)
        body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def upload_photos(
    opener: urllib.request.OpenerDirector,
    url: str,
    cookie_jar: CookieJar,
    files: list[tuple[str, str, bytes]],
) -> tuple[int, ResponseData]:
    payload, content_type = build_multipart(files)
    headers = {"Content-Type": content_type, **csrf_header(cookie_jar)}
    request = urllib.request.Request(url=url, data=payload, headers=headers, method="POST")
    try:
        with opener.open(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        parsed = json.loads(raw) if raw else None
        return exc.code, parsed


def portal_login(
    api_base_url: str, email: str, password: str
) -> tuple[urllib.request.OpenerDirector, CookieJar]:
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    payload = json.dumps({"email": email, "password": password}).encode("utf-8")
    request = urllib.request.Request(
        url=f"{api_base_url}/api/auth/login",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(request, timeout=10) as response:
        assert response.status == 200
    return opener, jar


def portal_request(api_base_url: str, email: str, password: str) -> ApiRequest:
    opener, jar = portal_login(api_base_url, email, password)

    def _request(
        path: str,
        method: str = "GET",
        payload: dict[str, object] | None = None,
        params: dict[str, str] | None = None,
    ) -> tuple[int, ResponseData]:
        url = f"{api_base_url}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"

        data = None
        headers: dict[str, str] = {}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        if method.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
            headers.update(csrf_header(jar))

        request = urllib.request.Request(url=url, data=data, headers=headers, method=method)
        try:
            with opener.open(request, timeout=10) as response:
                raw = response.read().decode("utf-8")
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            parsed = json.loads(raw) if raw else None
            return exc.code, parsed

    _request.opener = opener  # type: ignore[attr-defined]
    _request.jar = jar  # type: ignore[attr-defined]
    return _request


def create_issue(api_request: ApiRequest, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "Nefunkcni svetlo",
        "description": "Pokoj 301",
        "status": "new",
        "priority": "medium",
        "location": "Pokoj 301",
        "room_number": "301",
    }
    payload.update(overrides)
    status, data = api_request("/api/v1/issues", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_admin_can_reopen_and_delete_issue(api_request: ApiRequest) -> None:
    created = create_issue(api_request, status="resolved")

    update_status, updated = api_request(
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"status": "new", "title": "Znovu otevreno"},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "new"
    assert updated["title"] == "Znovu otevreno"
    assert updated["resolved_at"] is None
    assert updated["closed_at"] is None

    delete_status, _ = api_request(f"/api/v1/issues/{created['id']}", method="DELETE")
    assert delete_status == 204


def test_maintenance_can_list_create_and_edit_issue(api_base_url: str, api_request: ApiRequest) -> None:
    created = create_issue(api_request, room_number="204", location="Pokoj 204")
    maintenance_request = portal_request(api_base_url, "udrzba@example.com", "udrzba-pass")

    list_status, listed = maintenance_request("/api/v1/issues")
    assert list_status == 200
    assert isinstance(listed, list)
    assert any(item["id"] == created["id"] for item in listed)

    create_status, created_by_maintenance = maintenance_request(
        "/api/v1/issues",
        method="POST",
        payload={
            "title": "Nefunkcni radiator",
            "description": "Pokoj 221",
            "status": "new",
            "priority": "high",
            "location": "Pokoj 221",
            "room_number": "221",
        },
    )
    assert create_status == 201
    assert isinstance(created_by_maintenance, dict)

    update_status, updated = maintenance_request(
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"status": "resolved", "title": "Opraveno dnes"},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "resolved"
    assert updated["title"] == "Opraveno dnes"
    assert updated["resolved_at"] is not None

    list_status, listed = maintenance_request("/api/v1/issues")
    assert list_status == 200
    assert isinstance(listed, list)
    assert all(item["id"] != created["id"] for item in listed)


def test_maintenance_can_reopen_and_edit_completed_issue(
    api_base_url: str, api_request: ApiRequest
) -> None:
    created = create_issue(api_request, status="resolved")
    maintenance_request = portal_request(api_base_url, "udrzba@example.com", "udrzba-pass")

    status, data = maintenance_request(
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"title": "Tamper"},
    )
    assert status == 200
    assert isinstance(data, dict)
    assert data["title"] == "Tamper"

    status, data = maintenance_request(
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"status": "new"},
    )
    assert status == 200
    assert isinstance(data, dict)
    assert data["status"] == "new"


def test_housekeeping_can_create_issue_and_upload_photos(
    api_base_url: str,
) -> None:
    housekeeping_request = portal_request(api_base_url, "pokojska@example.com", "pokojska-pass")
    status, data = housekeeping_request(
        "/api/v1/issues",
        method="POST",
        payload={
            "title": "Rozbite zrcadlo",
            "description": "Pokoj 205",
            "status": "new",
            "priority": "medium",
            "location": "Pokoj 205",
            "room_number": "205",
        },
    )
    assert status == 201
    assert isinstance(data, dict)

    opener = housekeeping_request.opener  # type: ignore[attr-defined]
    jar = housekeeping_request.jar  # type: ignore[attr-defined]
    url = f"{api_base_url}/api/v1/issues/{data['id']}/photos"
    photo_status, photo_data = upload_photos(
        opener,
        url,
        jar,
        [("photos", "photo-1.jpg", b"one"), ("photos", "photo-2.jpg", b"two")],
    )
    assert photo_status == 200
    assert isinstance(photo_data, list)
    assert len(photo_data) == 2


def test_issue_photo_limit_is_cumulative(api_request: ApiRequest, api_base_url: str) -> None:
    created = create_issue(api_request)
    opener = getattr(api_request, "opener", urllib.request.build_opener())
    jar = getattr(api_request, "jar", CookieJar())
    url = f"{api_base_url}/api/v1/issues/{created['id']}/photos"

    ok_status, ok_data = upload_photos(
        opener,
        url,
        jar,
        [
            ("photos", "photo-1.jpg", b"one"),
            ("photos", "photo-2.jpg", b"two"),
        ],
    )
    assert ok_status == 200
    assert isinstance(ok_data, list)

    err_status, err_data = upload_photos(
        opener,
        url,
        jar,
        [
            ("photos", "photo-3.jpg", b"three"),
            ("photos", "photo-4.jpg", b"four"),
        ],
    )
    assert err_status == 400
    assert isinstance(err_data, dict)
    assert err_data["detail"] == "Maximum 3 photos"


def test_issue_delete_requires_admin(api_request: ApiRequest, api_base_url: str) -> None:
    created = create_issue(api_request, title="Test Delete")

    opener, jar = portal_login(api_base_url, "udrzba@example.com", "udrzba-pass")
    delete_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/issues/{created['id']}",
        headers=csrf_header(jar),
        method="DELETE",
    )
    try:
        opener.open(delete_request, timeout=10)
        assert False, "Expected 403 for portal delete"
    except urllib.error.HTTPError as exc:
        assert exc.code == 403

    delete_status, _ = api_request(f"/api/v1/issues/{created['id']}", method="DELETE")
    assert delete_status == 204


def test_maintenance_can_upload_issue_photos(api_request: ApiRequest, api_base_url: str) -> None:
    created = create_issue(api_request, title="Pokoj 224", room_number="224", location="Pokoj 224")
    opener, jar = portal_login(api_base_url, "udrzba@example.com", "udrzba-pass")
    url = f"{api_base_url}/api/v1/issues/{created['id']}/photos"
    photo_status, photo_data = upload_photos(
        opener,
        url,
        jar,
        [("photos", "photo-1.jpg", b"one")],
    )
    assert photo_status == 200
    assert isinstance(photo_data, list)
    assert len(photo_data) == 1
