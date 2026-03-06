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


def create_record(api_request: ApiRequest, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "item_type": "found",
        "description": "Stribrna nausnice",
        "category": "Nalez",
        "location": "Pokoj 402",
        "room_number": "402",
        "event_at": "2026-02-20T10:00:00Z",
        "status": "new",
        "tags": ["kontaktova"],
    }
    payload.update(overrides)
    status, data = api_request("/api/v1/lost-found", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_lost_found_crud(api_request: ApiRequest) -> None:
    created = create_record(api_request)

    read_status, detail = api_request(f"/api/v1/lost-found/{created['id']}")
    assert read_status == 200
    assert isinstance(detail, dict)
    assert detail["category"] == "Nalez"
    assert detail["room_number"] == "402"
    assert detail["tags"] == ["kontaktova"]

    update_status, updated = api_request(
        f"/api/v1/lost-found/{created['id']}",
        method="PUT",
        payload={"status": "stored", "tags": ["vyzvedne", "kontaktova"]},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "stored"
    assert sorted(updated["tags"]) == ["kontaktova", "vyzvedne"]

    delete_status, _ = api_request(f"/api/v1/lost-found/{created['id']}", method="DELETE")
    assert delete_status == 204


def test_lost_found_filters(api_request: ApiRequest) -> None:
    create_record(api_request, category="Kabelka", status="stored")
    create_record(api_request, category="Peněženka", status="disposed")

    status, filtered = api_request("/api/v1/lost-found", params={"status": "disposed"})
    assert status == 200
    assert isinstance(filtered, list)
    assert len(filtered) == 1
    assert filtered[0]["category"] == "Peněženka"


def test_lost_found_photo_limit(api_request: ApiRequest, api_base_url: str) -> None:
    created = create_record(api_request)
    opener = getattr(api_request, "opener", urllib.request.build_opener())
    jar = getattr(api_request, "jar", CookieJar())
    url = f"{api_base_url}/api/v1/lost-found/{created['id']}/photos"

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


def test_lost_found_delete_requires_admin(api_request: ApiRequest, api_base_url: str) -> None:
    created = create_record(api_request, category="Test Delete", status="new")

    opener, jar = portal_login(api_base_url, "recepce@example.com", "recepce-pass")
    delete_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/lost-found/{created['id']}",
        headers=csrf_header(jar),
        method="DELETE",
    )
    try:
        opener.open(delete_request, timeout=10)
        assert False, "Expected 403 for portal delete"
    except urllib.error.HTTPError as exc:
        assert exc.code == 403

    delete_status, _ = api_request(f"/api/v1/lost-found/{created['id']}", method="DELETE")
    assert delete_status == 204
