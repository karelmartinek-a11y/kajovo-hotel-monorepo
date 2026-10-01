#!/usr/bin/env python3
from __future__ import annotations

import json
import hashlib
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
    return r"""#!/usr/bin/env bash
set -euo pipefail
umask 077
upload_home="${DEPLOY_UPLOAD_HOME:?Missing DEPLOY_UPLOAD_HOME}"
release_archive="${upload_home}/${RELEASE_ARCHIVE}"
image_upload="${upload_home}/kajovo-release-images-${DEPLOY_SHA}"
release_parent="/home/deploy-hotel/kajovo-deploy-releases"
deploy_root="${release_parent}/${DEPLOY_SHA}"
vars_json="${upload_home}/kajovo-deploy-vars.json"
[[ "$DEPLOY_SHA" =~ ^[a-f0-9]{40}$ ]] || exit 1
[[ "$RELEASE_ARCHIVE" == "kajovo-deploy-${DEPLOY_SHA}.tar.gz" ]] || exit 1
mkdir -p "$release_parent"
exec 8>"$release_parent/.prepare.lock"
flock -x 8
staging="$(mktemp -d "$release_parent/.prepare-XXXXXXXX")"
trap 'rm -rf "$staging"; rm -f "$vars_json"' EXIT
test -f "$release_archive"
archive_hash="$(sha256sum "$release_archive" | cut -d ' ' -f1)"
if [ -e "$deploy_root" ]; then
  # Retries reuse the identical immutable release; never rewrite active source/env.
  test "$(cat "$deploy_root/.source-archive.sha256")" = "$archive_hash"
  python3 "$deploy_root/scripts/release_images.py" verify --directory "$deploy_root/artifacts/release-images" --sha "$DEPLOY_SHA"
else
  tar -xzf "$release_archive" -C "$staging"
  mkdir -p "$staging/artifacts"
  mv "$image_upload" "$staging/artifacts/release-images"
  python3 "$staging/scripts/release_images.py" verify --directory "$staging/artifacts/release-images" --sha "$DEPLOY_SHA"
  export DEPLOY_STAGING="$staging" DEPLOY_VARS_PATH="$vars_json"
  python3 - <<'PYENV'
import json, os, subprocess
from pathlib import Path

root = Path(os.environ['DEPLOY_STAGING'])
payload = json.loads(Path(os.environ['DEPLOY_VARS_PATH']).read_text())
# The live container identifies the active environment; a legacy checkout is not authority.
container = json.loads(subprocess.check_output(['docker', 'inspect', 'kajovo-prod-api-1']))[0]
labels = container['Config']['Labels']
source = labels.get('com.docker.compose.project.environment_file')
if not source:
    source = str(Path(labels['com.docker.compose.project.working_dir']) / '.env')
env_path = Path(source)
if not env_path.is_file():
    raise SystemExit('Active production environment unavailable')
current = {}
for line in env_path.read_text().splitlines():
    if line and not line.lstrip().startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        current[key] = value
runtime = dict(item.split('=', 1) for item in container['Config']['Env'] if '=' in item)
master = runtime.get('KAJOVO_API_VOICE_MASTER_KEY', '')
supplied = payload.get('KAJOVO_API_VOICE_MASTER_KEY', '')
if master and supplied and master != supplied:
    raise SystemExit('Existing Voice master key must be preserved')
postgres = json.loads(subprocess.check_output(['docker', 'inspect', 'kajovo-prod-postgres-1']))[0]
database = dict(item.split('=', 1) for item in postgres['Config']['Env'] if '=' in item)
# Preserve the effective live database contract, including a deliberately empty password.
def literal(value):
    if '\n' in value or '\r' in value:
        raise SystemExit('Multiline production env value rejected')
    return json.dumps(value.replace("$", "$$"), ensure_ascii=False)
for key, value in runtime.items():
    if key.startswith(('KAJOVO_API_', 'BETTER_HOTEL_', 'HOTEL_ADMIN_')):
        current[key] = literal(value)
for key in ('POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST_AUTH_METHOD'):
    if key in database:
        current[key] = literal(database[key])
url = runtime.get('KAJOVO_API_DATABASE_URL', '')
if not url:
    raise SystemExit('Active database URL unavailable')
current['KAJOVO_API_DATABASE_URL'] = literal(url)
if master:
    current['KAJOVO_API_VOICE_MASTER_KEY'] = literal(master)
for key in list(current):
    if key.startswith(('KAJOVO_API_MCP_', 'KAJOVO_API_SMART_TECHNOLOGIES_')):
        del current[key]
updates = {
    "KAJOVO_API_ADMIN_EMAIL": payload.get("KAJOVO_API_ADMIN_EMAIL") or payload.get("HOTEL_ADMIN_EMAIL", ""),
    "KAJOVO_API_ADMIN_PASSWORD": payload.get("KAJOVO_API_ADMIN_PASSWORD") or payload.get("HOTEL_ADMIN_PASSWORD", ""),
    "HOTEL_ADMIN_EMAIL": payload.get("HOTEL_ADMIN_EMAIL", ""),
    "HOTEL_ADMIN_PASSWORD": payload.get("HOTEL_ADMIN_PASSWORD", ""),
    "BETTER_HOTEL_CONNECTOR_BASE_URL": payload.get("BETTER_HOTEL_CONNECTOR_BASE_URL", ""),
    "BETTER_HOTEL_ACCESS_TOKEN": payload.get("BETTER_HOTEL_ACCESS_TOKEN", ""),
    "BETTER_HOTEL_CLIENT_TOKEN": payload.get("BETTER_HOTEL_CLIENT_TOKEN", ""),
    "KAJOVO_API_VOICE_MASTER_KEY": payload.get("KAJOVO_API_VOICE_MASTER_KEY", ""),
    "KAJOVO_API_WEB_PUSH_VAPID_PUBLIC_KEY": payload.get("KAJOVO_API_WEB_PUSH_VAPID_PUBLIC_KEY", ""),
    "KAJOVO_API_WEB_PUSH_VAPID_PRIVATE_KEY": payload.get("KAJOVO_API_WEB_PUSH_VAPID_PRIVATE_KEY", ""),
    "KAJOVO_API_WEB_PUSH_VAPID_SUBJECT": payload.get("KAJOVO_API_WEB_PUSH_VAPID_SUBJECT", ""),
    "KAJOVO_API_FIREBASE_SERVICE_ACCOUNT_JSON_B64": payload.get("KAJOVO_API_FIREBASE_SERVICE_ACCOUNT_JSON_B64", ""),
}
for key, value in updates.items():
    if value:
        if '\n' in value or '\r' in value:
            raise SystemExit('Multiline production env value rejected')
        current[key] = literal(value)
target = root / 'infra/.env'
target.write_text(''.join(f'{key}={value}\n' for key, value in sorted(current.items())))
target.chmod(0o600)
PYENV
  printf '%s\n' "$archive_hash" > "$staging/.source-archive.sha256"
  mv "$staging" "$deploy_root"
fi
rm -f "$release_archive" "$vars_json"
sudo -n /usr/local/bin/kajovo-hotel-release prepare "$DEPLOY_SHA"
sudo -n /usr/local/bin/kajovo-hotel-release activate "$DEPLOY_SHA"
flock -u 8
exec 8>&-
export DEPLOY_ROOT="$deploy_root"
python3 - <<'PYWORKER'
import json, os, time
from pathlib import Path
expected = os.environ['DEPLOY_SHA']
status = Path('/etc/kajovo-hotel-release-public/transaction.json')
artifact = Path(os.environ['DEPLOY_ROOT']) / 'artifacts/deploy-runtime/latest.json'
for _ in range(1800):
    state = json.loads(status.read_text())
    if state.get('sha') != expected or state.get('phase') not in {'active', 'accepted'}:
        raise SystemExit('Hotel deployment revoked')
    if state.get('worker') == 'FAIL':
        raise SystemExit('Hotel deployment worker failed')
    if state.get('worker') == 'PASS' and artifact.exists():
        if json.loads(artifact.read_text()).get('sha') != expected:
            raise SystemExit('Hotel runtime artifact SHA mismatch')
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


def exact_sha() -> str:
    sha = env("DEPLOY_SHA")
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise SystemExit("Invalid exact DEPLOY_SHA")
    return sha


def cmd_check_helper() -> None:
    checks = ["set -euo pipefail",
              "sudo -n /usr/local/bin/kajovo-sync-hotel-nginx --help >/dev/null",
              "test -x /usr/local/bin/kajovo-hotel-release",
              "systemctl is-active --quiet kajovo-hotel-release-deadline.timer"]
    for name in ("hotel_release.py", "release_images.py"):
        expected = hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
        path = shlex.quote("/usr/local/lib/kajovo-hotel-release/" + name)
        checks.extend([f"test -f {path} && test ! -L {path}",
                       f'test "$(stat -c %u {path})" = 0',
                       f'test "$(stat -c %a {path})" = 644',
                       f'test "$(sha256sum {path} | cut -d " " -f1)" = {shlex.quote(expected)}'])
    checks.append("echo 'Reviewed root hotel controller, deadline and nginx helper PASS'")
    run_remote("; ".join(checks))


def cmd_release(action: str) -> None:
    if action not in {"accept", "rollback", "status"}:
        raise ValueError("Invalid release action")
    run_remote(f"sudo -n /usr/local/bin/kajovo-hotel-release {action} {shlex.quote(exact_sha())}")


def cmd_deploy() -> None:
    archive = env("RELEASE_ARCHIVE")
    if not archive:
        raise SystemExit("Missing RELEASE_ARCHIVE")
    bundle = Path(env("RELEASE_IMAGES_DIR", "artifacts/release-images"))
    validate_bundle(bundle, env("DEPLOY_SHA"))
    exact_sha()
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
        f"env DEPLOY_UPLOAD_HOME=\"$upload_home\" DEPLOY_SHA={quoted_sha} RELEASE_ARCHIVE={shlex.quote(archive)} "
        'bash "$upload_home/kajovo-deploy-remote.sh"; '
        'rm -f "$upload_home/kajovo-deploy-remote.sh"'
    )


def cmd_verify_artifact() -> None:
    quoted_sha = shlex.quote(exact_sha())
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
            "<check-helper|deploy|verify-certificate|verify-artifact|accept|rollback|status>"
        )
    command = sys.argv[1]
    if command == "check-helper":
        cmd_check_helper()
    elif command in {"accept", "rollback", "status"}:
        cmd_release(command)
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
