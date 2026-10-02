#!/usr/bin/env python3
"""Manage only this gateway's generated recordings inside the running backend VM."""
import argparse
import base64
import json
import shlex
import subprocess
import sys
import time

GUEST_PROGRAM = r'''
import json, os, pathlib, re, stat, sys, time
root = pathlib.Path("/media/kajavoiceha")
if root.is_symlink():
    raise SystemExit("Managed recording directory must not be a symlink")
root.mkdir(mode=0o700, parents=False, exist_ok=True)
os.chmod(root, 0o700)
os.chown(root, 0, 0)
if sys.argv[1] == "prepare":
    print(json.dumps({"prepared": True}))
    raise SystemExit(0)
pattern = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$")
now = time.time()
files = []
removed = 0
with os.scandir(root) as entries:
    for entry in entries:
        if not pattern.fullmatch(entry.name) or entry.is_symlink():
            continue
        info = entry.stat(follow_symlinks=False)
        if not stat.S_ISREG(info.st_mode):
            continue
        if now - info.st_mtime > 86400:
            os.unlink(entry.path)
            removed += 1
        else:
            files.append((info.st_mtime, info.st_size, entry.path))
total = sum(size for _, size, _ in files)
for modified, size, path in sorted(files):
    if total <= 512 * 1024 * 1024:
        break
    # A recording is capped at 300 seconds. Do not unlink a file that may still be written.
    if now - modified < 600:
        continue
    os.unlink(path)
    total -= size
    removed += 1
print(json.dumps({"removed_files": removed, "remaining_bytes": total, "above_budget_deferred": total > 512 * 1024 * 1024}))
'''


def guest_command(arguments: dict) -> dict:
    result = subprocess.run(["virsh", "-c", "qemu:///system", "qemu-agent-command", "ha-hcasc", json.dumps(arguments)], check=True, capture_output=True, text=True, timeout=12)
    return json.loads(result.stdout)["return"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--operation", choices=("prepare", "cleanup"), required=True)
    args = parser.parse_args()
    command = "docker exec homeassistant python3 -c " + shlex.quote(GUEST_PROGRAM) + " " + shlex.quote(args.operation)
    started = guest_command({"execute": "guest-exec", "arguments": {"path": "/bin/sh", "arg": ["-c", command], "capture-output": True}})
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        status = guest_command({"execute": "guest-exec-status", "arguments": {"pid": started["pid"]}})
        if status.get("exited"):
            if status.get("exitcode", 1) != 0:
                # Do not emit guest stderr: management exceptions can include sensitive paths or content.
                raise SystemExit("Managed recording directory operation failed")
            payload = base64.b64decode(status.get("out-data", "")).decode("utf-8")
            report = json.loads(payload)
            print(json.dumps(report))
            return
        time.sleep(0.2)
    raise SystemExit("Managed recording directory operation timed out")


if __name__ == "__main__":
    main()
