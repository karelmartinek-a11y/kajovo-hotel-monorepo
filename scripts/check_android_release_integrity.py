from __future__ import annotations

import hashlib
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "android" / "release" / "android-release.json"
BUILD_GRADLE_PATH = REPO_ROOT / "android" / "app" / "build.gradle.kts"


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    apk_path = REPO_ROOT / manifest["download_path"]
    if int(manifest["version_code"]) <= 0 or not str(manifest["version_name"]).strip():
        raise SystemExit("Android release manifest má neplatnou verzi.")
    if not str(manifest["download_url"]).startswith("https://hotel.hcasc.cz/"):
        raise SystemExit("Android download URL musí používat produkční HTTPS doménu.")
    if not apk_path.is_file():
        raise SystemExit(f"Chybí produkční APK: {apk_path}")
    digest = hashlib.sha256(apk_path.read_bytes()).hexdigest()
    if digest != str(manifest["sha256"]).lower():
        raise SystemExit(f"SHA-256 APK neodpovídá manifestu: {digest}")

    gradle = BUILD_GRADLE_PATH.read_text(encoding="utf-8")
    for required in (
        "release/android-release.json",
        "versionCode = androidReleaseManifest.versionCode",
        "versionName = androidReleaseManifest.versionName",
    ):
        if required not in gradle:
            raise SystemExit(f"Android build není navázaný na manifest: {required}")

    print(f"Android release integrity: PASS ({manifest['version_name']}, {digest})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
