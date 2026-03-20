from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "android" / "release" / "android-release.json"
BUILD_GRADLE_PATH = REPO_ROOT / "android" / "app" / "build.gradle.kts"
REQUIRED_POLICY_SNIPPETS = {
    REPO_ROOT / "AGENTS.md": [
        "Jedinym zdrojem pravdy pro Android release metadata je `android/release/android-release.json`.",
        "CI a GitHub workflow musi release integrity blokovat.",
        "Kazda runtime zmena webove aplikace musi byt spojena i s adekvatni runtime zmenou nativni Android appky.",
    ],
    REPO_ROOT / "android" / "README_ANDROID.md": [
        "Jediný zdroj pravdy pro Android release metadata je `android/release/android-release.json`.",
        "python scripts/check_android_release_integrity.py",
        "Každá runtime změna Android aplikace musí být spojená i s adekvátní změnou webové verze",
        "wrapper nebo WebView-first model není přípustný",
    ],
    REPO_ROOT / "docs" / "how-to-deploy.md": [
        "android/release/android-release.json",
        "live `/api/app/android-release` neodpovídá release manifestu commitnutému v GitHubu",
        "každá runtime změna webu musí mít adekvátní runtime změnu Android appky",
    ],
    REPO_ROOT / "docs" / "release-checklist.md": [
        "python scripts/check_android_release_integrity.py",
        "live `/api/app/android-release`",
        "Každá runtime změna webu musí mít odpovídající runtime změnu Android appky a naopak.",
    ],
}


@dataclass(frozen=True)
class AndroidReleaseManifest:
    version_code: int
    version_name: str
    download_url: str
    download_path: str
    sha256: str
    title: str
    message: str
    required: bool

    @property
    def apk_path(self) -> Path:
        return REPO_ROOT / self.download_path


def load_manifest() -> AndroidReleaseManifest:
    payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return AndroidReleaseManifest(
        version_code=int(payload["version_code"]),
        version_name=str(payload["version_name"]),
        download_url=str(payload["download_url"]),
        download_path=str(payload["download_path"]),
        sha256=str(payload["sha256"]).lower(),
        title=str(payload["title"]),
        message=str(payload["message"]),
        required=bool(payload["required"]),
    )


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().lower()


def assert_build_gradle_is_manifest_driven(manifest: AndroidReleaseManifest) -> None:
    content = BUILD_GRADLE_PATH.read_text(encoding="utf-8")
    required_snippets = [
        "release/android-release.json",
        "versionCode = androidReleaseManifest.versionCode",
        "versionName = androidReleaseManifest.versionName",
        'buildConfigField("String", "ANDROID_RELEASE_DOWNLOAD_URL"',
        'buildConfigField("String", "ANDROID_RELEASE_SHA256"',
    ]
    missing = [snippet for snippet in required_snippets if snippet not in content]
    if missing:
        raise SystemExit(f"android/app/build.gradle.kts neni navazany na release manifest: {missing}")

    current_version_literals = re.findall(r'version(Name|Code)\s*=\s*(".*?"|\d+)', content)
    if not current_version_literals:
        return


def assert_manifest_is_consistent(manifest: AndroidReleaseManifest) -> None:
    if manifest.version_code <= 0:
        raise SystemExit("android release manifest ma neplatny version_code")
    if not manifest.version_name.strip():
        raise SystemExit("android release manifest ma prazdny version_name")
    if not manifest.download_url.startswith("https://hotel.hcasc.cz/"):
        raise SystemExit("android release manifest musi mirit na produkcni hotel.hcasc.cz download URL")
    if not manifest.title.strip() or not manifest.message.strip():
        raise SystemExit("android release manifest musi obsahovat title i message")
    if len(manifest.sha256) != 64 or any(ch not in "0123456789abcdef" for ch in manifest.sha256):
        raise SystemExit("android release manifest ma neplatny sha256")


def assert_apk_matches_manifest(manifest: AndroidReleaseManifest) -> None:
    apk_path = manifest.apk_path
    if not apk_path.exists():
        raise SystemExit(f"chybi produkcni APK: {apk_path}")
    actual_hash = sha256_of(apk_path)
    if actual_hash != manifest.sha256:
        raise SystemExit(
            f"sha256 produkcni APK neodpovida manifestu: expected {manifest.sha256}, got {actual_hash}"
        )


def assert_required_policy_docs_exist() -> None:
    for path, snippets in REQUIRED_POLICY_SNIPPETS.items():
        content = path.read_text(encoding="utf-8")
        missing = [snippet for snippet in snippets if snippet not in content]
        if missing:
            raise SystemExit(f"v povinne release dokumentaci chybi instrukce: {path} -> {missing}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Zkontroluje integritu release procesu Android aplikace.")
    parser.parse_args()

    manifest = load_manifest()
    assert_manifest_is_consistent(manifest)
    assert_build_gradle_is_manifest_driven(manifest)
    assert_apk_matches_manifest(manifest)
    assert_required_policy_docs_exist()

    print("Android release integrity: PASS")
    print(json.dumps(
        {
            "version_code": manifest.version_code,
            "version_name": manifest.version_name,
            "download_url": manifest.download_url,
            "apk_path": str(manifest.apk_path),
            "sha256": manifest.sha256,
            "required": manifest.required,
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
