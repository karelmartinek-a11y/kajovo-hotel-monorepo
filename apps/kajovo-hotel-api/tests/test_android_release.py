def test_android_release_metadata_is_public(api_base_url: str) -> None:
    import json
    import urllib.request

    with urllib.request.urlopen(f"{api_base_url}/api/app/android-release", timeout=10) as response:
        assert response.status == 200
        payload = json.loads(response.read().decode("utf-8"))

    assert payload["version"] == "0.1.4"
    assert payload["download_url"] == "https://hotel.hcasc.cz/downloads/kajovo-hotel-android.apk"
    assert payload["required"] is False
    assert "verze" in payload["title"].lower()
