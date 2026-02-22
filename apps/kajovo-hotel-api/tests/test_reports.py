from collections.abc import Callable


def create_report(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]], **overrides: object) -> dict[str, object]:
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


def test_reports_crud_and_filters(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]]) -> None:
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


def test_reports_validation(api_request: Callable[..., tuple[int, dict[str, object] | list[dict[str, object]] | None]]) -> None:
    status, _ = api_request(
        "/api/v1/reports",
        method="POST",
        payload={"title": "", "description": "desc", "status": "open"},
    )
    assert status == 422
