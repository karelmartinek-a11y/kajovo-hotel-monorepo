import json
import urllib.request


def test_health(api_base_url):
    with urllib.request.urlopen(f"{api_base_url}/health", timeout=2) as response:
        assert response.status == 200
        payload = json.loads(response.read().decode("utf-8"))

    assert payload == {"status": "ok"}
