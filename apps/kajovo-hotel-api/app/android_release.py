from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


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


def _manifest_path() -> Path:
    current = Path(__file__).resolve()
    candidates = [
        current.parents[3] / "android" / "release" / "android-release.json",
        current.parents[1] / "android" / "release" / "android-release.json",
        Path.cwd() / "android" / "release" / "android-release.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise FileNotFoundError("Android release manifest nebyl nalezen v zadne podporovane lokaci.")


@lru_cache
def get_android_release_manifest() -> AndroidReleaseManifest:
    payload = json.loads(_manifest_path().read_text(encoding="utf-8"))
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
