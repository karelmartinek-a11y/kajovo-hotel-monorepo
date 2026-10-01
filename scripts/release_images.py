"""Validate and import the exact image bundle tested by authoritative CI.

The SHA256 in an image ID is the Docker content digest of its configuration;
the bundle hash additionally binds every exported layer and tag. Production
uses those immutable IDs with pull_policy=never, never a remote rebuild.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

SERVICES = ("api", "web", "admin")
SHA = re.compile(r"[a-f0-9]{40}")
DIGEST = re.compile(r"sha256:[a-f0-9]{64}")


def file_digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validate_manifest(data: dict, sha: str) -> dict:
    if not SHA.fullmatch(sha):
        raise RuntimeError("exact_release_sha_required")
    if data.get("schema") != "kajovo_release_images.v1" or data.get("source_sha") != sha:
        raise RuntimeError("release_image_source_mismatch")
    if data.get("platform") != "linux/amd64":
        raise RuntimeError("release_image_platform_mismatch")
    if data.get("archive") != "images.tar.gz" or not re.fullmatch(r"[a-f0-9]{64}", data.get("archive_sha256", "")):
        raise RuntimeError("release_image_archive_invalid")
    images = data.get("images", {})
    if set(images) != set(SERVICES):
        raise RuntimeError("complete_release_images_required")
    for service, image in images.items():
        if image.get("tag") != f"kajovo-hotel-{service}:{sha}" or not DIGEST.fullmatch(image.get("id", "")):
            raise RuntimeError("release_image_identity_invalid")
    if data.get("checks") != {"api_import": "PASS", "production_proxy": "PASS"}:
        raise RuntimeError("tested_release_images_required")
    return data


def validate_bundle(directory: Path, sha: str) -> dict:
    manifest = validate_manifest(json.loads((directory / "manifest.json").read_text()), sha)
    archive = directory / manifest["archive"]
    if archive.is_symlink() or file_digest(archive) != manifest["archive_sha256"]:
        raise RuntimeError("release_image_archive_hash_mismatch")
    return manifest


def installed_image(tag: str) -> dict:
    rows = json.loads(subprocess.check_output(["docker", "image", "inspect", tag]))
    if len(rows) != 1:
        raise RuntimeError("release_image_missing")
    return rows[0]


def verify_installed(manifest: dict) -> None:
    for image in manifest["images"].values():
        actual = installed_image(image["tag"])
        if actual["Id"] != image["id"] or actual["Os"] != "linux" or actual["Architecture"] != "amd64":
            raise RuntimeError("installed_release_image_mismatch")


def write_compose_override(manifest: dict, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("services:\n" + "".join(
        f"  {service}:\n    image: {manifest['images'][service]['id']}\n    pull_policy: never\n"
        for service in SERVICES
    ))


def import_bundle(directory: Path, sha: str, target: Path) -> dict:
    manifest = validate_bundle(directory, sha)
    subprocess.run(["docker", "image", "load", "--input", str(directory / manifest["archive"])], check=True)
    verify_installed(manifest)
    write_compose_override(manifest, target)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["verify", "import", "verify-installed"])
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--compose-output", type=Path)
    args = parser.parse_args()
    if args.command == "import":
        if not args.compose_output:
            parser.error("--compose-output is required for import")
        import_bundle(args.directory, args.sha, args.compose_output)
    else:
        bundle = validate_bundle(args.directory, args.sha)
        if args.command == "verify-installed":
            verify_installed(bundle)
    print("Exact tested release image bundle PASS")
