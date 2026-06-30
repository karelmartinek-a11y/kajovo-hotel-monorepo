#!/usr/bin/env python3
from __future__ import annotations

import json
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


def remote_script_text() -> str:
    return """#!/usr/bin/env bash
set -euo pipefail
upload_home="${DEPLOY_UPLOAD_HOME:?Missing DEPLOY_UPLOAD_HOME}"
release_archive="${upload_home}/${RELEASE_ARCHIVE}"
release_root="/opt/kajovo-hotel-monorepo"
deploy_root="${upload_home}/kajovo-deploy-releases/${DEPLOY_SHA}"
preserve_dir="$(mktemp -d)"
vars_json="${upload_home}/kajovo-deploy-vars.json"
release_owner="$(id -un)"
release_group="$(id -gn)"
can_sudo=0
if sudo -n true >/dev/null 2>&1; then
  can_sudo=1
fi

run_release_root_cmd() {
  if [ "$can_sudo" -eq 1 ]; then
    sudo -n "$@"
  else
    "$@"
  fi
}

if [ ! -f "$release_archive" ]; then
  echo "Missing uploaded archive: $release_archive" >&2
  exit 1
fi
if run_release_root_cmd test -f "$release_root/infra/.env"; then
  mkdir -p "$preserve_dir/infra"
  run_release_root_cmd cat "$release_root/infra/.env" > "$preserve_dir/infra/.env"
fi
rm -rf "$deploy_root"
mkdir -p "$deploy_root"
tar -xzf "$release_archive" -C "$deploy_root"
mkdir -p "$deploy_root/infra"
if [ "$can_sudo" -eq 1 ]; then
  sudo -n chown -R "$release_owner:$release_group" "$deploy_root"
fi
if [ -f "$preserve_dir/infra/.env" ]; then
  mv "$preserve_dir/infra/.env" "$deploy_root/infra/.env"
elif [ ! -f "$deploy_root/infra/.env" ]; then
  : > "$deploy_root/infra/.env"
fi
export DEPLOY_VARS_PATH="$vars_json"
export DEPLOY_ROOT="$deploy_root"
python3 - <<'PY'
from pathlib import Path
import json
import os

env_path = Path(os.environ["DEPLOY_ROOT"]) / "infra/.env"
vars_path = Path(os.environ["DEPLOY_VARS_PATH"])
current = {}
for raw_line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
    if not raw_line or raw_line.lstrip().startswith("#") or "=" not in raw_line:
        continue
    key, value = raw_line.split("=", 1)
    current[key] = value

payload = json.loads(vars_path.read_text(encoding="utf-8"))
updates = {
    "KAJOVO_API_ADMIN_EMAIL": payload.get("KAJOVO_API_ADMIN_EMAIL") or payload.get("HOTEL_ADMIN_EMAIL", ""),
    "KAJOVO_API_ADMIN_PASSWORD": payload.get("KAJOVO_API_ADMIN_PASSWORD") or payload.get("HOTEL_ADMIN_PASSWORD", ""),
    "HOTEL_ADMIN_EMAIL": payload.get("HOTEL_ADMIN_EMAIL", ""),
    "HOTEL_ADMIN_PASSWORD": payload.get("HOTEL_ADMIN_PASSWORD", ""),
    "BETTER_HOTEL_CONNECTOR_BASE_URL": payload.get("BETTER_HOTEL_CONNECTOR_BASE_URL", ""),
    "BETTER_HOTEL_ACCESS_TOKEN": payload.get("BETTER_HOTEL_ACCESS_TOKEN", ""),
    "BETTER_HOTEL_CLIENT_TOKEN": payload.get("BETTER_HOTEL_CLIENT_TOKEN", ""),
}
for key, value in updates.items():
    if value:
        current[key] = value

env_path.write_text("".join(f"{key}={value}\\n" for key, value in sorted(current.items())), encoding="utf-8")
PY
rm -rf "$preserve_dir"
rm -f "$release_archive"
rm -f "$vars_json"
export SKIP_GIT_SYNC=true
export DEPLOY_SOURCE_SHA="$DEPLOY_SHA"
"$deploy_root/infra/ops/deploy-production.sh"
run_release_root_cmd mkdir -p "$release_root/artifacts/deploy-runtime"
run_release_root_cmd cp "$deploy_root/artifacts/deploy-runtime/latest.json" "$release_root/artifacts/deploy-runtime/latest.json"
cd "$deploy_root"
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-kajovo-prod}
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml ps -a
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml logs api --tail=300 || true
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml logs postgres --tail=80 || true
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml logs admin --tail=80 || true
docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml logs web --tail=80 || true
"""


def write_remote_vars(path: Path) -> None:
    keys = [
        "HOTEL_ADMIN_EMAIL",
        "HOTEL_ADMIN_PASSWORD",
        "KAJOVO_API_ADMIN_EMAIL",
        "KAJOVO_API_ADMIN_PASSWORD",
        "BETTER_HOTEL_CONNECTOR_BASE_URL",
        "BETTER_HOTEL_ACCESS_TOKEN",
        "BETTER_HOTEL_CLIENT_TOKEN",
    ]
    payload = {key: env(key) for key in keys}
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def upload(local_path: Path, remote_path: str) -> None:
    ssh_cmd, ssh_env = ssh_base()
    if remote_path.startswith("~/"):
        relative_target = remote_path[2:]
        relative_parent = str(Path(relative_target).parent)
        remote_target_expr = f"\"$HOME\"/{shlex.quote(relative_target)}"
        remote_parent_expr = "\"$HOME\"" if relative_parent in {"", "."} else f"\"$HOME\"/{shlex.quote(relative_parent)}"
    else:
        remote_target_expr = shlex.quote(remote_path)
        remote_parent_expr = shlex.quote(str(Path(remote_path).parent))
    payload = local_path.read_bytes()
    merged = os.environ.copy()
    if ssh_env:
        merged.update(ssh_env)
    subprocess.run(
        [
            *ssh_cmd,
            f"set -euo pipefail; umask 077; mkdir -p {remote_parent_expr}; cat > {remote_target_expr}",
        ],
        check=True,
        env=merged,
        input=payload,
    )


def run_remote(command: str) -> None:
    ssh_cmd, ssh_env = ssh_base()
    run([*ssh_cmd, command], env_override=ssh_env)


def cmd_check_helper() -> None:
    run_remote(
        "set -euo pipefail; "
        "sudo -n /usr/local/bin/kajovo-sync-hotel-nginx --help >/dev/null; "
        "test -w /opt/kajovo-hotel-monorepo; "
        "echo 'Remote nginx sync helper + deploy tree access: PASS'"
    )


def cmd_deploy() -> None:
    archive = env("RELEASE_ARCHIVE")
    if not archive:
        raise SystemExit("Missing RELEASE_ARCHIVE")
    upload(Path(archive), f"~/{archive}")
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        remote_script = tmp / "kajovo-deploy-remote.sh"
        remote_vars = tmp / "kajovo-deploy-vars.json"
        remote_script.write_text(remote_script_text(), encoding="utf-8")
        write_remote_vars(remote_vars)
        remote_script.chmod(0o700)
        remote_vars.chmod(0o600)
        upload(remote_script, "~/kajovo-deploy-remote.sh")
        upload(remote_vars, "~/kajovo-deploy-vars.json")
    quoted_sha = shlex.quote(env("DEPLOY_SHA"))
    run_remote(
        "set -euo pipefail; "
        'upload_home="$HOME"; '
        f"env DEPLOY_UPLOAD_HOME=\"$upload_home\" DEPLOY_SHA={quoted_sha} RELEASE_ARCHIVE={shlex.quote(archive)} "
        'bash "$upload_home/kajovo-deploy-remote.sh"; '
        'rm -f "$upload_home/kajovo-deploy-remote.sh"'
    )


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
