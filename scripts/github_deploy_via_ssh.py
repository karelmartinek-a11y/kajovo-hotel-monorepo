#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from release_images import validate_bundle
except ModuleNotFoundError:
    from scripts.release_images import validate_bundle


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
    keepalive = ["-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=20"]
    if identity:
        return (
            ["ssh", *keepalive, "-p", port, "-i", identity, f"{user}@{host}"],
            None,
        )
    password = env("HOTEL_DEPLOY_PASS")
    if not password:
        raise SystemExit("Missing HOTEL_DEPLOY_PASS/SSH_IDENTITY_FILE for SSH deploy")
    return (
        ["sshpass", "-e", "ssh", *keepalive, "-p", port, f"{user}@{host}"],
        {"SSHPASS": password},
    )


def remote_script_text() -> str:
    return """#!/usr/bin/env bash
set -euo pipefail
upload_home="${DEPLOY_UPLOAD_HOME:?Missing DEPLOY_UPLOAD_HOME}"
release_archive="${upload_home}/${RELEASE_ARCHIVE}"
image_upload="${upload_home}/kajovo-release-images-${DEPLOY_SHA}"
release_root="/opt/kajovo-hotel-monorepo"
deploy_root="${upload_home}/kajovo-deploy-releases/${DEPLOY_SHA}"
preserve_dir="$(mktemp -d)"
vars_json="${upload_home}/kajovo-deploy-vars.json"
release_owner="$(id -un)"
release_group="$(id -gn)"
# Release preparation also shares the runtime fence, preventing retries from
# rewriting source/environment underneath a running managed deployment.
exec 8</etc/home-assistant-mcp-public/runtime.lock
flock -x 8
python3 - <<'PYPREPARE'
import json, os
from pathlib import Path
state = json.loads(Path('/etc/home-assistant-mcp-public/transaction.json').read_text())
if state.get('phase') != 'active' or state.get('hotel_sha') != os.environ['DEPLOY_SHA'] or state.get('hotel_worker') == 'PASS':
    raise SystemExit('Release preparation transaction revoked or already completed')
if state.get('sha') != os.environ['COORDINATED_MCP_SHA']:
    raise SystemExit('Release preparation MCP transaction changed')
PYPREPARE
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
  chmod 600 "$preserve_dir/infra/.env"
fi
rm -rf "$deploy_root"
mkdir -p "$deploy_root"
tar -xzf "$release_archive" -C "$deploy_root"
mkdir -p "$deploy_root/artifacts"
mv "$image_upload" "$deploy_root/artifacts/release-images"
python3 "$deploy_root/scripts/release_images.py" verify \
  --directory "$deploy_root/artifacts/release-images" --sha "$DEPLOY_SHA"
printf '%s\\n' "$COORDINATED_MCP_SHA" > "$deploy_root/.coordinated-mcp-sha"
mkdir -p "$deploy_root/infra"
if [ "$can_sudo" -eq 1 ]; then
  sudo -n chown -R "$release_owner:$release_group" "$deploy_root"
fi
if [ -f "$preserve_dir/infra/.env" ]; then
  mv "$preserve_dir/infra/.env" "$deploy_root/infra/.env"
elif [ ! -f "$deploy_root/infra/.env" ]; then
  : > "$deploy_root/infra/.env"
fi
chmod 600 "$deploy_root/infra/.env"
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
# Root provisioning publishes only this fingerprint; the key is preserved in server env.
import hashlib
fingerprint_path = Path('/etc/home-assistant-mcp-public/signing-key.sha256')
expected = fingerprint_path.read_text().strip()
key = current.get('KAJOVO_API_MCP_SIGNING_KEY', '')
if len(key) < 32 or hashlib.sha256(key.encode()).hexdigest() != expected:
    raise SystemExit('MCP signing key fingerprint mismatch')
print('Hotel/MCP signing key fingerprint equality PASS')

for key in list(current):
    if key.startswith("KAJOVO_API_" + "SMART_" + "TECHNOLOGIES_"):
        current.pop(key)
updates = {
    "KAJOVO_API_ADMIN_EMAIL": payload.get("KAJOVO_API_ADMIN_EMAIL") or payload.get("HOTEL_ADMIN_EMAIL", ""),
    "KAJOVO_API_ADMIN_PASSWORD": payload.get("KAJOVO_API_ADMIN_PASSWORD") or payload.get("HOTEL_ADMIN_PASSWORD", ""),
    "HOTEL_ADMIN_EMAIL": payload.get("HOTEL_ADMIN_EMAIL", ""),
    "HOTEL_ADMIN_PASSWORD": payload.get("HOTEL_ADMIN_PASSWORD", ""),
    "BETTER_HOTEL_CONNECTOR_BASE_URL": payload.get("BETTER_HOTEL_CONNECTOR_BASE_URL", ""),
    "BETTER_HOTEL_ACCESS_TOKEN": payload.get("BETTER_HOTEL_ACCESS_TOKEN", ""),
    "BETTER_HOTEL_CLIENT_TOKEN": payload.get("BETTER_HOTEL_CLIENT_TOKEN", ""),
    "KAJOVO_API_VOICE_MASTER_KEY": payload.get("KAJOVO_API_VOICE_MASTER_KEY", ""),
    "KAJOVO_API_MCP_SERVER_URL": payload.get("KAJOVO_API_MCP_SERVER_URL", ""),
    "KAJOVO_API_WEB_PUSH_VAPID_PUBLIC_KEY": payload.get("KAJOVO_API_WEB_PUSH_VAPID_PUBLIC_KEY", ""),
    "KAJOVO_API_WEB_PUSH_VAPID_PRIVATE_KEY": payload.get("KAJOVO_API_WEB_PUSH_VAPID_PRIVATE_KEY", ""),
    "KAJOVO_API_WEB_PUSH_VAPID_SUBJECT": payload.get("KAJOVO_API_WEB_PUSH_VAPID_SUBJECT", ""),
    "KAJOVO_API_FIREBASE_SERVICE_ACCOUNT_JSON_B64": payload.get("KAJOVO_API_FIREBASE_SERVICE_ACCOUNT_JSON_B64", ""),
}
for key, value in updates.items():
    if value:
        current[key] = value

env_path.write_text("".join(f"{key}={value}\\n" for key, value in sorted(current.items())), encoding="utf-8")
PY
rm -rf "$preserve_dir"
rm -f "$release_archive"
rm -f "$vars_json"
# Activation owns the deploy service. Upload only signals the exact release ready.
printf '%s\\n' "$DEPLOY_SHA" > "$deploy_root/.coordinated-ready"
flock -u 8
exec 8<&-
python3 - <<'PYWORKER'
import json
import os
import time
from pathlib import Path
status = Path('/etc/home-assistant-mcp-public/transaction.json')
expected = os.environ['DEPLOY_SHA']
artifact = Path(os.environ['DEPLOY_ROOT']) / 'artifacts/deploy-runtime/latest.json'
for _ in range(1800):
    state = json.loads(status.read_text())
    if state.get('hotel_sha') != expected or state.get('sha') != os.environ['COORDINATED_MCP_SHA'] or state.get('phase') not in {'active', 'accepted_cleanup_pending', 'accepted'}:
        raise SystemExit('Coordinated hotel deployment revoked')
    if state.get('hotel_worker') == 'PASS' and artifact.exists():
        payload = json.loads(artifact.read_text())
        if payload.get('sha') != expected:
            raise SystemExit('Coordinated runtime artifact SHA mismatch')
        print('Managed exact SHA hotel deployment PASS')
        break
    time.sleep(1)
else:
    raise SystemExit('Managed hotel deployment timeout')
PYWORKER
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
        "KAJOVO_API_VOICE_MASTER_KEY",
        "KAJOVO_API_MCP_SERVER_URL",
        "KAJOVO_API_WEB_PUSH_VAPID_PUBLIC_KEY",
        "KAJOVO_API_WEB_PUSH_VAPID_PRIVATE_KEY",
        "KAJOVO_API_WEB_PUSH_VAPID_SUBJECT",
        "KAJOVO_API_FIREBASE_SERVICE_ACCOUNT_JSON_B64",
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
    merged = os.environ.copy()
    if ssh_env:
        merged.update(ssh_env)
    # Image archives can exceed a gigabyte. Stream them rather than buffering
    # the entire release in the runner's memory; publish only complete uploads.
    with local_path.open("rb") as payload:
        subprocess.run(
            [*ssh_cmd, f"set -euo pipefail; umask 077; mkdir -p {remote_parent_expr}; "
             f"cat > {remote_target_expr}.incomplete; mv {remote_target_expr}.incomplete {remote_target_expr}"],
            check=True, env=merged, stdin=payload,
        )


def run_remote(command: str) -> None:
    ssh_cmd, ssh_env = ssh_base()
    run([*ssh_cmd, command], env_override=ssh_env)


def certificate_verification_script() -> str:
    return r"""set -euo pipefail
certificate="$(
  openssl s_client \
    -connect hotel.hcasc.cz:443 \
    -servername hotel.hcasc.cz \
    -verify_return_error \
    </dev/null 2>/dev/null |
    openssl x509 -outform PEM
)"
printf '%s\n' "$certificate" | openssl x509 -checkend 2592000 -noout
echo 'Production TLS certificate validity: PASS (>30 days)'
"""


def cmd_verify_certificate() -> None:
    run(["bash", "-c", certificate_verification_script()])


def pre_upload_cleanup_script() -> str:
    return r"""set -euo pipefail
upload_home="$HOME"
release_dir="$upload_home/kajovo-deploy-releases"

echo "Disk usage before deploy cleanup:"
df -h "$upload_home"

# This maintenance helper is not invoked before deployment. Remove only aged
# incomplete uploads; retained release trees/images belong to accepted cleanup.
find "$upload_home" -maxdepth 1 -type f -name 'kajovo-deploy-*.tar.gz' -mtime +7 -delete
find "$upload_home" -maxdepth 1 -type f -name 'kajovo-deploy-*.tar.gz.incomplete' -mtime +7 -delete

echo "Disk usage after deploy cleanup:"
df -h "$upload_home"
"""


def cmd_prepare_upload() -> None:
    run_remote(pre_upload_cleanup_script())


def cmd_check_helper() -> None:
    run_remote(
        "set -euo pipefail; "
        "sudo -n /usr/local/bin/kajovo-sync-hotel-nginx --help >/dev/null; "
        "test -w /opt/kajovo-hotel-monorepo; "
        "echo 'Remote nginx sync helper + deploy tree access: PASS'"
    )


def cmd_check_transaction() -> None:
    deploy_sha = env("DEPLOY_SHA")
    if len(deploy_sha) != 40 or any(char not in "0123456789abcdef" for char in deploy_sha):
        raise SystemExit("Invalid DEPLOY_SHA for coordinated transaction check")
    quoted_sha = shlex.quote(deploy_sha)
    mcp_sha = env("COORDINATED_MCP_SHA")
    if len(mcp_sha) != 40 or any(char not in "0123456789abcdef" for char in mcp_sha):
        raise SystemExit("Invalid COORDINATED_MCP_SHA for coordinated transaction check")
    run_remote(
        "set -euo pipefail; "
        f"DEPLOY_SHA={quoted_sha} COORDINATED_MCP_SHA={shlex.quote(mcp_sha)} python3 - <<'PY'\n"
        "import json, os\n"
        "from pathlib import Path\n"
        "state = json.loads(Path('/etc/home-assistant-mcp-public/transaction.json').read_text())\n"
        "expected = os.environ['DEPLOY_SHA']\n"
        "if state.get('phase') != 'active':\n"
        "    raise SystemExit('coordinated_transaction_not_active')\n"
        "if state.get('hotel_sha') != expected:\n"
        "    raise SystemExit('coordinated_transaction_hotel_sha_mismatch')\n"
        "mcp_sha = str(state.get('sha') or '')\n"
        "if len(mcp_sha) != 40 or any(c not in '0123456789abcdef' for c in mcp_sha):\n"
        "    raise SystemExit('coordinated_transaction_mcp_sha_invalid')\n"
        "if os.environ.get('COORDINATED_MCP_SHA') and mcp_sha != os.environ['COORDINATED_MCP_SHA']:\n"
        "    raise SystemExit('coordinated_transaction_mcp_sha_mismatch')\n"
        "print('Exact hotel SHA coordinated transaction: PASS')\n"
        "PY\n"
        "systemctl is-active --quiet home-assistant-mcp-rollback.timer; "
        "echo 'Rollback deadline armed: PASS'"
    )


def readiness_script(sha: str, mcp_sha: str) -> str:
    if len(sha) != 40 or any(char not in "0123456789abcdef" for char in sha):
        raise RuntimeError("exact_readiness_sha_required")
    if len(mcp_sha) != 40 or any(char not in "0123456789abcdef" for char in mcp_sha):
        raise RuntimeError("exact_mcp_readiness_sha_required")
    return ("set -euo pipefail; "
            f"DEPLOY_SHA={shlex.quote(sha)} COORDINATED_MCP_SHA={shlex.quote(mcp_sha)} python3 - <<'PYREADY'\n"
            "import json, os, subprocess\n"
            "from pathlib import Path\n"
            "path = Path('/etc/home-assistant-mcp-public/transaction.json')\n"
            "state = json.loads(path.read_text()) if path.exists() else {}\n"
            "mcp = str(state.get('sha') or '')\n"
            "valid_mcp = len(mcp) == 40 and all(c in '0123456789abcdef' for c in mcp)\n"
            "ready = (state.get('phase') == 'active' and state.get('hotel_sha') == os.environ['DEPLOY_SHA']\n"
            "         and state.get('hotel_worker') != 'PASS' and valid_mcp\n"
            "         and (not os.environ['COORDINATED_MCP_SHA'] or mcp == os.environ['COORDINATED_MCP_SHA']))\n"
            "if ready:\n"
            "    ready = subprocess.run(['systemctl', 'is-active', '--quiet', 'home-assistant-mcp-rollback.timer'],\n"
            "                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0\n"
            "print(json.dumps({'ready': ready, 'mcp_sha': mcp if valid_mcp else ''}))\n"
            "PYREADY\n")


def cmd_check_readiness() -> None:
    ssh_cmd, ssh_env = ssh_base()
    merged = os.environ.copy()
    if ssh_env:
        merged.update(ssh_env)
    payload = json.loads(subprocess.check_output(
        [*ssh_cmd, readiness_script(env("DEPLOY_SHA"), env("COORDINATED_MCP_SHA"))], env=merged, text=True))
    if not isinstance(payload.get("ready"), bool):
        raise RuntimeError("invalid_coordinator_readiness_response")
    mcp_sha = payload.get("mcp_sha")
    if (not isinstance(mcp_sha, str) or (mcp_sha and not re.fullmatch(r"[a-f0-9]{40}", mcp_sha))
            or payload["ready"] and mcp_sha != env("COORDINATED_MCP_SHA")):
        raise RuntimeError("invalid_coordinator_readiness_identity")
    if output := env("GITHUB_OUTPUT"):
        with Path(output).open("a") as stream:
            stream.write(f"ready={str(payload['ready']).lower()}\nmcp_sha={payload['mcp_sha']}\n")
    print("Coordinated transaction READY" if payload["ready"] else "Deployment deferred: coordinated transaction is not READY")


def cmd_deploy() -> None:
    archive = env("RELEASE_ARCHIVE")
    if not archive:
        raise SystemExit("Missing RELEASE_ARCHIVE")
    bundle = Path(env("RELEASE_IMAGES_DIR", "artifacts/release-images"))
    validate_bundle(bundle, env("DEPLOY_SHA"))
    cmd_check_transaction()
    upload(Path(archive), f"~/{archive}")
    for filename in ("manifest.json", "images.tar.gz"):
        upload(bundle / filename, f"~/kajovo-release-images-{env('DEPLOY_SHA')}/{filename}")
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
        f"env DEPLOY_UPLOAD_HOME=\"$upload_home\" DEPLOY_SHA={quoted_sha} COORDINATED_MCP_SHA={shlex.quote(env('COORDINATED_MCP_SHA'))} RELEASE_ARCHIVE={shlex.quote(archive)} "
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
        "path = Path.home() / 'kajovo-deploy-releases' / os.environ['DEPLOY_SHA'] / 'artifacts/deploy-runtime/latest.json'\n"
        "if not path.exists():\n"
        "    raise SystemExit(f'Missing runtime artifact on server: {path}')\n"
        "payload = json.loads(path.read_text(encoding='utf-8'))\n"
        "expected = os.environ['DEPLOY_SHA']\n"
        "actual = str(payload.get('sha') or '')\n"
        "if actual != expected:\n"
        "    raise SystemExit(f'deploy artifact SHA mismatch: expected {expected}, got {actual}')\n"
        "manifest = json.loads((path.parents[1] / 'release-images/manifest.json').read_text())\n"
        "if payload.get('images') != manifest.get('images') or payload.get('image_archive_sha256') != manifest.get('archive_sha256'):\n"
        "    raise SystemExit('Runtime image artifact mismatch')\n"
        "import subprocess\n"
        "for service, image in manifest['images'].items():\n"
        "    actual = subprocess.check_output(['docker', 'inspect', '--format', '{{.Image}}', 'kajovo-prod-' + service + '-1'], text=True).strip()\n"
        "    if actual != image['id']:\n"
        "        raise SystemExit('Running production image identity mismatch')\n"
        "print('Deploy runtime artifact SHA on server: PASS')\n"
        "PY"
    )


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(
            "Usage: github_deploy_via_ssh.py "
            "<check-helper|check-transaction|check-readiness|deploy|verify-certificate|verify-artifact>"
        )
    command = sys.argv[1]
    if command == "check-helper":
        cmd_check_helper()
    elif command == "check-transaction":
        cmd_check_transaction()
    elif command == "check-readiness":
        cmd_check_readiness()
    elif command == "deploy":
        cmd_deploy()
    elif command == "verify-certificate":
        cmd_verify_certificate()
    elif command == "verify-artifact":
        cmd_verify_artifact()
    else:
        raise SystemExit(f"Unknown command: {command}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
