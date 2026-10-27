"""Content-free protected state, with complete filesystem hashes through existing Docker rights.

The helper has no network, capabilities, writable host mounts or Docker socket.
Only fixed configuration/runtime roots are exposed; incomplete evidence fails closed.
"""
import argparse
import hashlib
import json
import os
import shlex
from pathlib import Path
import subprocess


UNITS = (
    "kajovosmart-mcp.service", "kajovosmart-mcp-chatgpt-oauth.service",
    "mail-mcp-standalone.service", "kajavoiceha.service", "smartplan.service",
    "dagmar-backend.service", "kajovo-server-readonly-mcp.service",
    "kajovo-server-readonly-mcp-auth.service", "kajovo-server-readonly-mcp-broker.service",
    "nginx.service",
)
PROPERTIES = (
    "Id", "ActiveState", "SubState", "MainPID", "ExecMainStartTimestampMonotonic",
    "FragmentPath", "DropInPaths", "User", "Group", "WorkingDirectory",
)
FILES = (
    "/etc/systemd/system/kajovosmart-mcp.service",
    "/etc/systemd/system/kajovosmart-mcp-chatgpt-oauth.service",
    "/etc/smartnewgen/runtime.env", "/etc/smartnewgen/secret-library.json",
    "/etc/smartnewgen-chatgpt-oauth/config.json", "/opt/smartnewgen/current/smartnewgen",
    "/etc/systemd/system/kajavoiceha.service", "/etc/systemd/system/smartplan.service",
    "/etc/kajavoiceha/clients.json", "/etc/kajavoiceha/oauth-config.json",
    "/etc/smartplan/config.json",
    "/opt/kajavoiceha/current/catalog.json", "/opt/kajavoiceha/current/solar-config.json",
    "/opt/kajavoiceha/current/deploy/solar-calendar.py",
    "/opt/smartplan/current/docs/SMARTPLAN-UPSTREAM-CONTRACT.json",
    "/opt/kajavoiceha/current/BUILD.json", "/opt/kajavoiceha/current/bin/kajavoiceha",
    "/opt/smartplan/current/BUILD.json", "/opt/smartplan/current/venv/bin/python",
    "/opt/smartplan/current/smartplan/__init__.py",
    "/opt/smartplan/current/smartplan/runtime.py",
    "/opt/smartplan/current/smartplan/app.py",
)
RUNTIME_TREES = ("/opt/kajavoiceha/current/bin", "/opt/smartplan/current/smartplan")
CONFIG_TREES = ("/etc/nginx", "/etc/smartnewgen", "/etc/smartnewgen-chatgpt-oauth", "/etc/kajavoiceha", "/etc/smartplan")
CURRENT = ("/opt/smartnewgen/current", "/opt/kajavoiceha/current", "/opt/smartplan/current")


# Mount at the original absolute paths so existing absolute symlinks retain their meaning.
MOUNT_ROOTS = (
    "/etc/nginx", "/etc/systemd/system", "/usr/lib/systemd/system",
    "/usr/share/nginx/modules-available", "/etc/smartnewgen",
    "/etc/smartnewgen-chatgpt-oauth", "/etc/kajavoiceha", "/etc/smartplan",
    "/opt/smartnewgen", "/opt/kajavoiceha", "/opt/smartplan",
)


_MOUNTED_ROOTS = None


def check_mount_boundary(path):
    if _MOUNTED_ROOTS is not None:
        try:
            resolved = path.resolve(strict=True)
        except FileNotFoundError:
            return
        if not any(resolved.is_relative_to(root) for root in _MOUNTED_ROOTS):
            raise RuntimeError("protected_path_outside_readonly_mounts")


def fingerprint(path):
    try:
        check_mount_boundary(path)
        result = {"symlink": os.readlink(path)} if path.is_symlink() else {}
        try:
            result["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        except FileNotFoundError:
            result["evidence"] = "absent"
        return result
    except PermissionError:
        return {"evidence": "privileged_snapshot_required"}
    except FileNotFoundError:
        return {"evidence": "absent"}


def tree_fingerprint(path):
    def denied(error):
        raise error
    try:
        check_mount_boundary(path)
        path.stat()
        entries = {}
        # pathlib.rglob suppresses unreadable-directory errors on some versions.
        for directory, names, files in os.walk(path, onerror=denied):
            names[:] = sorted(name for name in names if name != "__pycache__")
            for name in sorted(files):
                entry = Path(directory) / name
                if entry.suffix != ".pyc":
                    entries[str(entry.relative_to(path))] = fingerprint(entry)
        return entries
    except PermissionError:
        return {"evidence": "privileged_snapshot_required"}
    except FileNotFoundError:
        return {"evidence": "absent"}


def snapshot(root=Path("/"), command=subprocess.check_output, *, units=None):
    if units is None:
        units = command([
            "systemctl", "show", *UNITS,
            *["--property=" + item for item in PROPERTIES],
        ], text=True)
    paths = set(FILES)
    for line in units.splitlines():
        if line.startswith(("FragmentPath=", "DropInPaths=")):
            paths.update(path for path in shlex.split(line.split("=", 1)[1]) if path.startswith("/"))
    files = {name: fingerprint(root / name.lstrip("/")) for name in sorted(paths)}
    links = {}
    for name in CURRENT:
        try:
            links[name] = {"target": str((root / name.lstrip("/")).readlink())}
        except PermissionError:
            links[name] = {"evidence": "privileged_snapshot_required"}
        except FileNotFoundError:
            links[name] = {"evidence": "absent"}
    result = {"units": units, "current": links, "immutable_and_config": files,
              "runtime_code": {name: tree_fingerprint(root / name.lstrip("/")) for name in RUNTIME_TREES},
              "config_trees": {name: tree_fingerprint(root / name.lstrip("/")) for name in CONFIG_TREES}}
    def gaps(value, prefix=""):
        if isinstance(value, dict):
            if value.get("evidence") == "privileged_snapshot_required":
                return [prefix]
            return [item for key, child in value.items() for item in gaps(child, prefix + "/" + key)]
        return []
    result["privileged_snapshot_required"] = gaps(result)
    result["coverage"] = "privileged_required" if result["privileged_snapshot_required"] else "complete"
    return result


def require_complete(value):
    if value.get("coverage") != "complete" or value.get("privileged_snapshot_required"):
        raise RuntimeError("protected_snapshot_incomplete")
    return value


def filesystem_command(image, mounts):
    if not image.startswith("sha256:") or len(image) != 71 or any(c not in "0123456789abcdef" for c in image[7:]):
        raise ValueError("immutable_snapshot_image_required")
    command = ["docker", "run", "--rm", "-i", "--pull=never", "--network=none",
        "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
        "--user=0:0", "--pids-limit=32", "--memory=128m", "--cpus=0.5"]
    for source, target in mounts:
        command += ["--mount", "type=bind,src=" + source + ",dst=" + target + ",readonly,bind-recursive=disabled"]
    return command


def filesystem_snapshot(image, units, mounts):
    command = filesystem_command(image, mounts)
    command += ["--entrypoint=python", image, "-c", Path(__file__).read_text(), "--filesystem"]
    result = subprocess.run(command, input=json.dumps({"units": units, "roots": [target for _, target in mounts]}),
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60, check=True)
    value = require_complete(json.loads(result.stdout))
    value["transport"] = "docker_readonly"
    return value


def docker_snapshot(image):
    units = subprocess.check_output(["systemctl", "show", *UNITS,
        *["--property=" + item for item in PROPERTIES]], text=True)
    roots = []
    for name in MOUNT_ROOTS:
        try:
            Path(name).stat()
        except FileNotFoundError:
            continue
        roots.append((name, name))
    return filesystem_snapshot(image, units, roots)


def main():
    global _MOUNTED_ROOTS
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--docker-image")
    mode.add_argument("--filesystem", action="store_true")
    args = parser.parse_args()
    if args.filesystem:
        payload = json.load(__import__("sys").stdin)
        _MOUNTED_ROOTS = tuple(Path(root).resolve(strict=True) for root in payload["roots"])
        value = require_complete(snapshot(units=payload["units"]))
        value["mount_roots"] = sorted(payload["roots"])
    elif args.docker_image is not None:
        value = docker_snapshot(args.docker_image)
    else:
        value = snapshot()
    print(json.dumps(value, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
