import sqlite3
from collections.abc import Callable
from pathlib import Path

ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]


def test_health(api_request: ApiRequest) -> None:
    status, payload = api_request("/health")
    assert status == 200
    assert payload == {"status": "ok"}


def test_ready(api_request: ApiRequest) -> None:
    status, payload = api_request("/ready")
    assert status == 200
    assert payload == {"status": "ready"}


def test_write_requests_are_audited(
    api_request: ApiRequest, api_db_path: Path
) -> None:
    status, created = api_request(
        "/api/v1/reports",
        method="POST",
        payload={"title": "Leak in room 201", "description": "Water on floor", "status": "open"},
    )
    assert status == 201
    assert isinstance(created, dict)

    delete_status, _ = api_request(f"/api/v1/reports/{created['id']}", method="DELETE")
    assert delete_status == 204

    conn = sqlite3.connect(str(api_db_path))
    try:
        row = conn.execute(
            "SELECT actor, module, action, resource, status_code "
            "FROM audit_trail WHERE action = 'POST' "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
    finally:
        conn.close()

    assert row == ("admin@kajovohotel.local", "reports", "POST", "/api/v1/reports", 201)
