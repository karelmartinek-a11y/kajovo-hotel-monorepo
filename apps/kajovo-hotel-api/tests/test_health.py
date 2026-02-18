import json
import sqlite3
import urllib.request


def test_health(api_base_url):
    with urllib.request.urlopen(f"{api_base_url}/health", timeout=2) as response:
        assert response.status == 200
        payload = json.loads(response.read().decode("utf-8"))

    assert payload == {"status": "ok"}


def test_ready(api_base_url):
    with urllib.request.urlopen(f"{api_base_url}/ready", timeout=2) as response:
        assert response.status == 200
        payload = json.loads(response.read().decode("utf-8"))

    assert payload == {"status": "ready"}


def test_write_requests_are_audited(api_base_url):
    payload = {"title": "Leak in room 201", "description": "Water on floor", "status": "open"}
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{api_base_url}/api/v1/reports",
        data=data,
        headers={"Content-Type": "application/json", "x-user": "qa.user"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=2) as response:
        assert response.status == 201
        created = json.loads(response.read().decode("utf-8"))

    delete_request = urllib.request.Request(
        f"{api_base_url}/api/v1/reports/{created['id']}",
        method="DELETE",
    )
    with urllib.request.urlopen(delete_request, timeout=2) as response:
        assert response.status == 204

    conn = sqlite3.connect("test_kajovo_hotel.db")
    try:
        row = conn.execute(
            "SELECT actor, module, action, resource, status_code "
            "FROM audit_trail WHERE action = 'POST' "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
    finally:
        conn.close()

    assert row == ("qa.user", "reports", "POST", "/api/v1/reports", 201)
