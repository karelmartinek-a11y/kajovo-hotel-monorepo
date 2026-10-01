"""Build each production image once, test those IDs, then export their bundle."""
from __future__ import annotations

import argparse
import gzip
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

from release_images import SERVICES, file_digest, installed_image, validate_bundle, verify_installed

ROOT = Path(__file__).resolve().parents[1]
API_CHECK = (
    "from app.main import app; import pywebpush, firebase_admin; "
    "from app.services.housekeeping import COUNTRY_TRANSLATION; "
    "assert COUNTRY_TRANSLATION.gettext('Germany') == 'Německo'; "
    "assert '/api/v1/admin/voice-core/sessions' in app.openapi()['paths']; "
    "assert len([p for p in app.openapi()['paths'] if p.startswith('/api/v1/admin/voice-core/')]) == 3; "
    "from voice_core_server import VoiceCoreConfig, session_config; "
    "from voice_core_server.contracts import CAPABILITY_REGISTRY; "
    "assert not CAPABILITY_REGISTRY; "
    "assert session_config(VoiceCoreConfig(), 'gpt-realtime-2.1')['tool_choice'] == 'none'; "
    "assert 'tools' not in session_config(VoiceCoreConfig(), 'gpt-realtime-2.1'); "
    "assert any(p.startswith('/api/v1/chat') for p in app.openapi()['paths'])"
)


def build(sha: str, output: Path, existing: bool = False) -> None:
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise RuntimeError("exact_build_sha_required")
    checkout_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if checkout_sha != sha:
        raise RuntimeError("build_checkout_sha_mismatch")
    tags = {service: f"kajovo-hotel-{service}:{sha}" for service in SERVICES}
    for service, tag in tags.items():
        if not existing:
            subprocess.run(["docker", "build", "--platform", "linux/amd64", "-f",
                            f"apps/kajovo-hotel-{service}/Dockerfile", "-t", tag, "."], cwd=ROOT, check=True)
    images = {service: {"tag": tag, "id": installed_image(tag)["Id"]} for service, tag in tags.items()}
    # Test immutable IDs so tag changes cannot substitute another runtime.
    subprocess.run(["docker", "run", "--rm", "--entrypoint", "python", images["api"]["id"],
                    "-c", API_CHECK], check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts/verify_voice_core_proxy.py"),
                    "--api-image", images["api"]["id"], "--web-image", images["web"]["id"],
                    "--admin-image", images["admin"]["id"]], check=True)
    output.mkdir(parents=True, exist_ok=True)
    uncompressed = output / "images.tar"
    archive = output / "images.tar.gz"
    subprocess.run(["docker", "image", "save", "--output", str(uncompressed), *tags.values()], check=True)
    try:
        with uncompressed.open("rb") as source, archive.open("wb") as destination:
            with gzip.GzipFile(fileobj=destination, mode="wb", compresslevel=1, mtime=0) as zipped:
                shutil.copyfileobj(source, zipped)
    finally:
        uncompressed.unlink(missing_ok=True)
    manifest = {"schema": "kajovo_release_images.v1", "source_sha": sha, "platform": "linux/amd64",
                "archive": archive.name, "archive_sha256": file_digest(archive), "images": images,
                "checks": {"api_import": "PASS", "production_proxy": "PASS"}}
    verify_installed(manifest)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    validate_bundle(output, sha)
    print("Immutable production image bundle: exact tested API/web/admin PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--existing", action="store_true", help="Package images built by the cached CI Docker actions")
    args = parser.parse_args()
    build(args.sha, args.output, args.existing)
