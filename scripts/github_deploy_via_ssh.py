#!/usr/bin/env python3
from __future__ import annotations

import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def run(cmd: list[str], *, env_override: dict[str, str] | None = None) -> None:
    merged = os.environ.copy()
    if env_override:
        merged.update(env_override)
    subprocess.run(cmd, check=True, env=merged)


def ssh_base() -> tuple[list[str], dict[str, str] | None]:
    host = env("HOTEL_DEPLOY_HOST")
    user = env("HOTEL_DEPLOY_USER")
    port = env("HOTEL_DEPLOY_PORT")
    identity = env("SSH_IDENTITY_FILE")
    if identity:
      return (["ssh", "-p", port, "-i", identity, f"{user}@{host}"], None)
    password = env("HOTEL_DEPLOY_PASS")
    if not password:
        raise SystemExit("Missing HOTEL_DEPLOY_PASS/SSH_IDENTITY_FILE for SSH deploy")
    return (
        ["sshpass", "-e", "ssh", "-p", port, f"{user}@{host}"],
        {"SSHPASS": password},
    )


def scp_base() -> tuple[list[str], dict[str, str] | None]:
    host = env("HOTEL_DEPLOY_HOST")
    user = env("HOTEL_DEPLOY_USER")
    port = env("HOTEL_DEPLOY_PORT")
    identity = env("SSH_IDENTITY_FILE")
    if identity:
      return (["scp", "-P", port, "-i", identity], None)
    password = env("HOTEL_DEPLOY_PASS")
    if not password:
        raise SystemExit("Missing HOTEL_DEPLOY_PASS/SSH_IDENTITY_FILE for SCP deploy")
    return (["sshpass", "-e", "scp", "-P", port], {"SSHPASS": password})


def remote_script_text() -> str:
    return """#!/usr/bin/env bash
set -euo pipefail
release_archive="/tmp/${RELEASE_ARCHIVE}"
release_root="/opt/kajovo-hotel-monorepo"
preserve_dir="$(mktemp -d)"
if [ ! -f "$release_archive" ]; then
  echo "Missing uploaded archive: $release_archive" >&2
  exit 1
fi
if [ -f "$release_root/infra/.env" ]; then
  mkdir -p "$preserve_dir/infra"
  cp "$release_root/infra/.env" "$preserve_dir/infra/.env"
fi
mkdir -p "$release_root"
find "$release_root" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
tar -xzf "$release_archive" -C "$release_root"
mkdir -p "$release_root/infra"
if [ -f "$preserve_dir/infra/.env" ]; then
  mv "$preserve_dir/infra/.env" "$release_root/infra/.env"
elif [ ! -f "$release_root/infra/.env" ]; then
  : > "$release_root/infra/.env"
fi
python3 - <<'PY'
from pathlib import Path
import os

env_path = Path("/opt/kajovo-hotel-monorepo/infra/.env")
current = {}
for raw_line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
    if not raw_line or raw_line.lstrip().startswith("#") or "=" not in raw_line:
        continue
    key, value = raw_line.split("=", 1)
    current[key] = value

updates = {
    "KAJOVO_API_ADMIN_EMAIL": os.environ.get("KAJOVO_API_ADMIN_EMAIL") or os.environ.get("HOTEL_ADMIN_EMAIL", ""),
    "KAJOVO_API_ADMIN_PASSWORD": os.environ.get("KAJOVO_API_ADMIN_PASSWORD") or os.environ.get("HOTEL_ADMIN_PASSWORD", ""),
    "HOTEL_ADMIN_EMAIL": os.environ.get("HOTEL_ADMIN_EMAIL", ""),
    "HOTEL_ADMIN_PASSWORD": os.environ.get("HOTEL_ADMIN_PASSWORD", ""),
    "BETTER_HOTEL_CONNECTOR_BASE_URL": os.environ.get("BETTER_HOTEL_CONNECTOR_BASE_URL", ""),
    "BETTER_HOTEL_ACCESS_TOKEN": os.environ.get("BETTER_HOTEL_ACCESS_TOKEN", ""),
    "BETTER_HOTEL_CLIENT_TOKEN": os.environ.get("BETTER_HOTEL_CLIENT_TOKEN", ""),
}
for key, value in updates.items():
    if value:
        current[key] = value

env_path.write_text("".join(f"{key}={value}\\n" for key, value in sorted(current.items())), encoding="utf-8")
PY
rm -rf "$preserve_dir"
rm -f "$release_archive"
export KAJOVO_API_ADMIN_EMAIL="${KAJOVO_API_ADMIN_EMAIL:-$HOTEL_ADMIN_EMAIL}"
export KAJOVO_API_ADMIN_PASSWORD="${KAJOVO_API_ADMIN_PASSWORD:-$HOTEL_ADMIN_PASSWORD}"
export SKIP_GIT_SYNC=true
export DEPLOY_SOURCE_SHA="$DEPLOY_SHA"
"$release_root/infra/ops/deploy-production.sh"
cd "$release_root"
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-kajovo-prod}
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml ps -a
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml logs api --tail=300 || true
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml logs postgres --tail=80 || true
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml logs admin --tail=80 || true
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml logs web --tail=80 || true
"""


def write_remote_env(path: Path) -> None:
    keys = [
        "DEPLOY_SHA",
        "RELEASE_ARCHIVE",
        "HOTEL_ADMIN_EMAIL",
        "HOTEL_ADMIN_PASSWORD",
        "KAJOVO_API_ADMIN_EMAIL",
        "KAJOVO_API_ADMIN_PASSWORD",
        "BETTER_HOTEL_CONNECTOR_BASE_URL",
        "BETTER_HOTEL_ACCESS_TOKEN",
        "BETTER_HOTEL_CLIENT_TOKEN",
    ]
    path.write_text(
        "".join(f"export {key}={shlex.quote(env(key))}\n" for key in keys),
        encoding="utf-8",
    )


def upload(local_path: Path, remote_path: str) -> None:
    scp_cmd, scp_env = scp_base()
    host = env("HOTEL_DEPLOY_HOST")
    user = env("HOTEL_DEPLOY_USER")
    run([*scp_cmd, str(local_path), f"{user}@{host}:{remote_path}"], env_override=scp_env)


def run_remote(command: str) -> None:
    ssh_cmd, ssh_env = ssh_base()
    run([*ssh_cmd, command], env_override=ssh_env)


def cmd_check_helper() -> None:
    run_remote("set -euo pipefail; sudo -n /usr/local/bin/kajovo-sync-hotel-nginx --help >/dev/null; echo 'Remote nginx sync helper: PASS'")


def cmd_deploy() -> None:
    archive = env("RELEASE_ARCHIVE")
    if not archive:
        raise SystemExit("Missing RELEASE_ARCHIVE")
    upload(Path(archive), f"/tmp/{archive}")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        remote_script = tmp / "kajovo-deploy-remote.sh"
        remote_env = tmp / "kajovo-deploy-remote.env"
        remote_script.write_text(remote_script_text(), encoding="utf-8")
        remote_env.write_text("", encoding="utf-8")
        write_remote_env(remote_env)
        remote_script.chmod(0o700)
        remote_env.chmod(0o600)
        upload(remote_script, "/tmp/kajovo-deploy-remote.sh")
        upload(remote_env, "/tmp/kajovo-deploy-remote.env")
    run_remote("set -euo pipefail; . /tmp/kajovo-deploy-remote.env; bash /tmp/kajovo-deploy-remote.sh; rm -f /tmp/kajovo-deploy-remote.sh /tmp/kajovo-deploy-remote.env")


def cmd_verify_artifact() -> None:
    deploy_sha = env("DEPLOY_SHA")
    quoted_sha = shlex.quote(deploy_sha)
    run_remote(
        "set -euo pipefail; "
        f"DEPLOY_SHA={quoted_sha} python3 - <<'PY'\n"
        "import json, os\n"
        "from pathlib import Path\n"
        "path = Path('/opt/kajovo-hotel-monorepo/artifacts/deploy-runtime/latest.json')\n"
        "if not path.exists():\n"
        "    raise SystemExit(f'Missing runtime artifact on server: {path}')\n"
        "payload = json.loads(path.read_text(encoding='utf-8'))\n"
        "expected = os.environ['DEPLOY_SHA']\n"
        "actual = str(payload.get('sha') or '')\n"
        "if actual not in {expected, expected[:7]}:\n"
        "    raise SystemExit(f'deploy artifact SHA mismatch: expected {expected}, got {actual}')\n"
        "print('Deploy runtime artifact SHA on server: PASS')\n"
        "PY"
    )


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: github_deploy_via_ssh.py <check-helper|deploy|verify-artifact>")
    command = sys.argv[1]
    if command == "check-helper":
        cmd_check_helper()
    elif command == "deploy":
        cmd_deploy()
    elif command == "verify-artifact":
        cmd_verify_artifact()
    else:
        raise SystemExit(f"Unknown command: {command}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
