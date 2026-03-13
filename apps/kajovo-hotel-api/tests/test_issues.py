import json
import urllib.error
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


def portal_login(api_base_url: str, email: str, password: str) -> tuple[urllib.request.OpenerDirector, CookieJar]:
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


def test_issues_crud_and_workflow(api_request: ApiRequest) -> None:
    created = create_issue(api_request)

    read_status, detail = api_request(f"/api/v1/issues/{created['id']}")
    assert read_status == 200
    assert isinstance(detail, dict)
    assert detail["status"] == "new"

    update_status, updated = api_request(
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"status": "in_progress", "priority": "high"},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "in_progress"
    assert updated["priority"] == "high"

    resolve_status, resolved = api_request(
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"status": "resolved"},
    )
    assert resolve_status == 200
    assert isinstance(resolved, dict)
    assert resolved["status"] == "resolved"
    assert resolved["resolved_at"] is not None

    delete_status, _ = api_request(f"/api/v1/issues/{created['id']}", method="DELETE")
    assert delete_status == 204


def test_issues_filters(api_request: ApiRequest) -> None:
    create_issue(api_request, title="Issue A", status="new", priority="low")
    create_issue(api_request, title="Issue B", status="resolved", priority="high")

    status, filtered = api_request("/api/v1/issues", params={"status": "resolved"})
    assert status == 200
    assert isinstance(filtered, list)
    assert len(filtered) == 1
    assert filtered[0]["title"] == "Issue B"


def test_issue_photo_limit(api_request: ApiRequest, api_base_url: str) -> None:
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
            ("photos", "photo-3.jpg", b"three"),
        ],
    )
    assert ok_status == 200
    assert isinstance(ok_data, list)

    err_status, err_data = upload_photos(
        opener,
        url,
        jar,
        [
            ("photos", "photo-1.jpg", b"one"),
            ("photos", "photo-2.jpg", b"two"),
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


def test_maintenance_can_only_resolve_open_issues(api_request: ApiRequest, api_base_url: str) -> None:
    created = create_issue(api_request, title="Pokoj 224", room_number="224", location="Pokoj 224")
    opener, jar = portal_login(api_base_url, "udrzba@example.com", "udrzba-pass")

    list_request = urllib.request.Request(url=f"{api_base_url}/api/v1/issues", method="GET")
    with opener.open(list_request, timeout=10) as response:
        listed = json.loads(response.read().decode("utf-8"))
    assert any(item["id"] == created["id"] for item in listed)

    bad_payload = json.dumps({"description": "Nesmí přepisovat popis"}).encode("utf-8")
    bad_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/issues/{created['id']}",
        data=bad_payload,
        headers={"Content-Type": "application/json", **csrf_header(jar)},
        method="PUT",
    )
    try:
        opener.open(bad_request, timeout=10)
        assert False, "Expected 403 when maintenance edits non-status fields"
    except urllib.error.HTTPError as exc:
        assert exc.code == 403

    resolve_payload = json.dumps({"status": "resolved"}).encode("utf-8")
    resolve_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/issues/{created['id']}",
        data=resolve_payload,
        headers={"Content-Type": "application/json", **csrf_header(jar)},
        method="PUT",
    )
    with opener.open(resolve_request, timeout=10) as response:
        resolved = json.loads(response.read().decode("utf-8"))
    assert resolved["status"] == "resolved"

    with opener.open(list_request, timeout=10) as response:
        listed_after = json.loads(response.read().decode("utf-8"))
    assert all(item["id"] != created["id"] for item in listed_after)
