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


def create_report(api_request: ApiRequest, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "Prasklá žárovka",
        "description": "Pokoj 104",
        "status": "open",
    }
    payload.update(overrides)
    status, data = api_request("/api/v1/reports", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_reports_crud_and_filters(api_request: ApiRequest) -> None:
    first = create_report(api_request, title="Report A", status="open")
    create_report(api_request, title="Report B", status="closed")

    list_status, listed = api_request("/api/v1/reports", params={"status": "closed"})
    assert list_status == 200
    assert isinstance(listed, list)
    assert len(listed) == 1
    assert listed[0]["title"] == "Report B"

    update_status, updated = api_request(
        f"/api/v1/reports/{first['id']}",
        method="PUT",
        payload={"status": "in_progress"},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "in_progress"

    delete_status, _ = api_request(f"/api/v1/reports/{first['id']}", method="DELETE")
    assert delete_status == 204


def test_reports_validation(api_request: ApiRequest) -> None:
    status, _ = api_request(
        "/api/v1/reports",
        method="POST",
        payload={"title": "", "description": "desc", "status": "open"},
    )
    assert status == 422


def test_report_photo_pipeline(api_request: ApiRequest, api_base_url: str) -> None:
    created = create_report(api_request, title="Photo report")
    opener = getattr(api_request, "opener", urllib.request.build_opener())
    jar = getattr(api_request, "jar", CookieJar())
    upload_url = f"{api_base_url}/api/v1/reports/{created['id']}/photos"

    upload_status, upload_payload = upload_photos(
        opener,
        upload_url,
        jar,
        [
            ("photos", "photo-1.jpg", b"one"),
            ("photos", "photo-2.jpg", b"two"),
        ],
    )
    assert upload_status == 200
    assert isinstance(upload_payload, list)
    assert len(upload_payload) == 2

    list_status, listed = api_request(f"/api/v1/reports/{created['id']}/photos")
    assert list_status == 200
    assert isinstance(listed, list)
    assert len(listed) == 2

    photo_id = int(listed[0]["id"])
    thumb_request = urllib.request.Request(
        url=f"{api_base_url}/api/v1/reports/{created['id']}/photos/{photo_id}/thumb",
        method="GET",
    )
    with opener.open(thumb_request, timeout=10) as response:
        assert response.status == 200
