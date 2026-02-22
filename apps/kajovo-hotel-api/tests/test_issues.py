from collections.abc import Callable

ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]


def create_issue(api_request: ApiRequest, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "title": "Nefunkční světlo",
        "description": "Pokoj 301",
        "status": "new",
        "priority": "medium",
        "location": "Pokoj 301",
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

    close_status, closed = api_request(
        f"/api/v1/issues/{created['id']}",
        method="PUT",
        payload={"status": "closed"},
    )
    assert close_status == 200
    assert isinstance(closed, dict)
    assert closed["status"] == "closed"

    delete_status, _ = api_request(f"/api/v1/issues/{created['id']}", method="DELETE")
    assert delete_status == 204


def test_issues_filters(api_request: ApiRequest) -> None:
    create_issue(api_request, title="Issue A", status="new", priority="low")
    create_issue(api_request, title="Issue B", status="closed", priority="high")

    status, filtered = api_request("/api/v1/issues", params={"status": "closed"})
    assert status == 200
    assert isinstance(filtered, list)
    assert len(filtered) == 1
    assert filtered[0]["title"] == "Issue B"
