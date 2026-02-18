import json
import urllib.error
import urllib.parse
import urllib.request


def api_request(
    base_url: str,
    path: str,
    method: str = "GET",
    payload: dict[str, object] | None = None,
    params: dict[str, str] | None = None,
) -> tuple[int, dict[str, object] | list[dict[str, object]] | None]:
    url = f"{base_url}{path}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    data = None
    headers: dict[str, str] = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url=url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        parsed = json.loads(raw) if raw else None
        return exc.code, parsed


def create_report(base_url: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "Nefunkční lampa",
        "description": "Světlo na chodbě ve 2. patře.",
        "status": "open",
    }
    payload.update(overrides)
    status, data = api_request(base_url, "/api/v1/reports", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_reports_crud_and_filters(api_base_url: str) -> None:
    created = create_report(api_base_url)
    create_report(api_base_url, title="Únik vody", status="in_progress")

    list_status, listed = api_request(api_base_url, "/api/v1/reports")
    assert list_status == 200
    assert isinstance(listed, list)
    assert len(listed) == 2

    detail_status, detail = api_request(api_base_url, f"/api/v1/reports/{created['id']}")
    assert detail_status == 200
    assert isinstance(detail, dict)
    assert detail["title"] == "Nefunkční lampa"

    update_status, updated = api_request(
        api_base_url,
        f"/api/v1/reports/{created['id']}",
        method="PUT",
        payload={"status": "closed", "description": "Opraveno."},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "closed"

    filter_status, filtered = api_request(
        api_base_url,
        "/api/v1/reports",
        params={"status": "in_progress"},
    )
    assert filter_status == 200
    assert isinstance(filtered, list)
    assert len(filtered) == 1
    assert filtered[0]["title"] == "Únik vody"

    delete_status, _ = api_request(
        api_base_url,
        f"/api/v1/reports/{created['id']}",
        method="DELETE",
    )
    assert delete_status == 204

    missing_status, _ = api_request(api_base_url, f"/api/v1/reports/{created['id']}")
    assert missing_status == 404


def test_reports_validation(api_base_url: str) -> None:
    bad_status, bad_payload = api_request(
        api_base_url,
        "/api/v1/reports",
        method="POST",
        payload={"title": "Hi", "status": "bad"},
    )
    assert bad_status == 422
    assert isinstance(bad_payload, dict)
