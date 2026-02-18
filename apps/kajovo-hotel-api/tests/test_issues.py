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


def create_issue(base_url: str, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "Nefunkční světlo",
        "description": "Světlo v koupelně bliká a zhasíná.",
        "location": "2. patro",
        "room_number": "204",
        "priority": "high",
        "status": "new",
    }
    payload.update(overrides)
    status, data = api_request(base_url, "/api/v1/issues", method="POST", payload=payload)
    assert status == 201
    assert isinstance(data, dict)
    return data


def test_issues_crud_and_workflow(api_base_url: str) -> None:
    created = create_issue(api_base_url)

    list_status, listed = api_request(api_base_url, "/api/v1/issues")
    assert list_status == 200
    assert isinstance(listed, list)
    assert len(listed) == 1

    update_status, updated = api_request(
        api_base_url,
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"status": "in_progress", "assignee": "Petr Údržba"},
    )
    assert update_status == 200
    assert isinstance(updated, dict)
    assert updated["status"] == "in_progress"
    assert updated["in_progress_at"] is not None

    resolve_status, resolved = api_request(
        api_base_url,
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"status": "resolved"},
    )
    assert resolve_status == 200
    assert isinstance(resolved, dict)
    assert resolved["resolved_at"] is not None

    close_status, closed = api_request(
        api_base_url,
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"status": "closed"},
    )
    assert close_status == 200
    assert isinstance(closed, dict)
    assert closed["closed_at"] is not None


def test_issues_filters(api_base_url: str) -> None:
    create_issue(
        api_base_url,
        title="Prasklé zrcadlo",
        location="Lobby",
        room_number=None,
        priority="critical",
    )
    create_issue(
        api_base_url,
        title="Klimatizace",
        location="4. patro",
        room_number="401",
        priority="medium",
    )

    priority_status, priority_items = api_request(
        api_base_url,
        "/api/v1/issues",
        params={"priority": "critical"},
    )
    assert priority_status == 200
    assert isinstance(priority_items, list)
    assert len(priority_items) == 1
    assert priority_items[0]["title"] == "Prasklé zrcadlo"

    location_status, location_items = api_request(
        api_base_url,
        "/api/v1/issues",
        params={"location": "4. patro"},
    )
    assert location_status == 200
    assert isinstance(location_items, list)
    assert len(location_items) == 1
    assert location_items[0]["room_number"] == "401"
