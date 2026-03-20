import json
import urllib.request
from pathlib import Path


def _load_manifest() -> dict[str, object]:
    manifest_path = Path(__file__).resolve().parents[3] / "android" / "release" / "android-release.json"
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def test_android_release_metadata_is_public(api_base_url: str) -> None:
    manifest = _load_manifest()

    with urllib.request.urlopen(f"{api_base_url}/api/app/android-release", timeout=10) as response:
        assert response.status == 200
        payload = json.loads(response.read().decode("utf-8"))

    assert payload["version_code"] == manifest["version_code"]
    assert payload["version"] == manifest["version_name"]
    assert payload["download_url"] == manifest["download_url"]
    assert payload["sha256"] == manifest["sha256"]
    assert payload["required"] is manifest["required"]
    assert payload["title"] == manifest["title"]
    assert payload["message"] == manifest["message"]


def test_android_release_headers_are_present_on_api_responses(api_base_url: str) -> None:
    manifest = _load_manifest()
    with urllib.request.urlopen(f"{api_base_url}/api/health", timeout=10) as response:
        assert response.status == 200
        assert response.headers["X-Kajovo-Android-Version"] == manifest["version_name"]
        assert response.headers["X-Kajovo-Android-Version-Code"] == str(manifest["version_code"])
        assert response.headers["X-Kajovo-Android-Update-Required"] == (
            "true" if manifest["required"] else "false"
        )
