import json
import urllib.request


def test_create_and_list_reports(api_base_url):
    body = json.dumps(
        {"title": "Broken lamp", "description": "Room 12 corridor light is broken."}
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{api_base_url}/api/v1/reports",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=2) as response:
        assert response.status == 201
        payload = json.loads(response.read().decode("utf-8"))

    assert payload["title"] == "Broken lamp"
    assert payload["status"] == "open"

    with urllib.request.urlopen(f"{api_base_url}/api/v1/reports", timeout=2) as response:
        assert response.status == 200
        list_payload = json.loads(response.read().decode("utf-8"))

    assert len(list_payload) == 1
    assert list_payload[0]["title"] == "Broken lamp"
