"""Content-free snapshot of standalone runtimes; never reads their mutable stores.

The deploy account cannot read private credentials or the HA release directory.
Those gaps are explicit and require the privileged before/after release evidence;
this script neither expands privileges nor substitutes live database hashes.
"""
import hashlib
import json
import os
import shlex
from pathlib import Path
import subprocess


UNITS = (
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
CONFIG_TREES = ("/etc/kajavoiceha", "/etc/smartplan")
CURRENT = ("/opt/kajavoiceha/current", "/opt/smartplan/current")


def fingerprint(path):
    try:
        return {"sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    except PermissionError:
        return {"evidence": "privileged_snapshot_required"}
    except FileNotFoundError:
        return {"evidence": "absent"}


def tree_fingerprint(path):
    def denied(error):
        raise error
    try:
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


def snapshot(root=Path("/"), command=subprocess.check_output):
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


if __name__ == "__main__":
    print(json.dumps(snapshot(), sort_keys=True, separators=(",", ":")))
