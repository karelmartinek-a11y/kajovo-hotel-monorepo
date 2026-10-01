#!/usr/bin/env bash
set -euo pipefail

# One-time operator provisioning. Deployment cannot install or replace this
# root authority and cannot invoke its internal worker or deadline commands.
if [[ "$(id -u)" != "0" ]]; then
  echo "Hotel release controller installation requires root" >&2
  exit 1
fi
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
for command in python3 docker systemctl systemd-run runuser visudo; do
  command -v "$command" >/dev/null
done
/usr/bin/python3 -I - <<'PYVERSION'
import sys
if sys.version_info < (3, 11):
    raise SystemExit('Python 3.11 or later is required')
PYVERSION
id deploy-hotel >/dev/null

# Legacy root release transactions can also mutate the hotel. Provisioning
# fails closed until an operator has retired that authority; it never stops or
# disables Home Assistant or any other foreign service.
HOTEL_RELEASE_CONTROLLER_SOURCE="$ROOT_DIR/scripts/hotel_release.py" /usr/bin/python3 -I - <<'PYAUTHORITY'
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location('hotel_release_provisioning', os.environ['HOTEL_RELEASE_CONTROLLER_SOURCE'])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
try:
    module.Host().assert_single_authority(module.Layout())
except module.ReleaseError as error:
    raise SystemExit(str(error)) from None
PYAUTHORITY

install -d -o root -g root -m 0755 /usr/local/lib/kajovo-hotel-release
install -o root -g root -m 0644 "$ROOT_DIR/scripts/hotel_release.py" /usr/local/lib/kajovo-hotel-release/hotel_release.py
install -o root -g root -m 0644 "$ROOT_DIR/scripts/release_images.py" /usr/local/lib/kajovo-hotel-release/release_images.py
install -d -o root -g root -m 0700 /var/lib/kajovo-hotel-release
install -d -o root -g root -m 0755 /etc/kajovo-hotel-release-public

# Never replace an existing lock inode: a running worker may hold that inode.
/usr/bin/python3 -I - <<'PYLOCK'
import os, stat
path = '/etc/kajovo-hotel-release-public/runtime.lock'
fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o644)
try:
    info = os.fstat(fd)
    if info.st_uid != 0 or info.st_nlink != 1 or not stat.S_ISREG(info.st_mode):
        raise SystemExit('Existing hotel runtime lock is untrusted')
    os.fchmod(fd, 0o644)
finally:
    os.close(fd)
PYLOCK

staging_dir="$(mktemp -d)"
trap 'rm -rf "$staging_dir"' EXIT
cat > "$staging_dir/kajovo-hotel-release" <<'WRAPPER'
#!/bin/sh
exec /usr/bin/python3 -I /usr/local/lib/kajovo-hotel-release/hotel_release.py "$@"
WRAPPER
install -o root -g root -m 0755 "$staging_dir/kajovo-hotel-release" /usr/local/bin/kajovo-hotel-release

cat > "$staging_dir/kajovo-hotel-release-deadline.service" <<'SERVICE'
[Unit]
Description=Restore an unaccepted or failed Kájovo Hotel release
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=root
UMask=0077
ExecStart=/usr/local/bin/kajovo-hotel-release deadline
TimeoutStartSec=1800
StandardOutput=null
StandardError=journal
SERVICE

cat > "$staging_dir/kajovo-hotel-release-deadline.timer" <<'TIMER'
[Unit]
Description=Independent Kájovo Hotel acceptance deadline

[Timer]
OnBootSec=15s
OnUnitInactiveSec=15s
AccuracySec=1s
Unit=kajovo-hotel-release-deadline.service

[Install]
WantedBy=timers.target
TIMER
install -o root -g root -m 0644 "$staging_dir/kajovo-hotel-release-deadline.service" /etc/systemd/system/kajovo-hotel-release-deadline.service
install -o root -g root -m 0644 "$staging_dir/kajovo-hotel-release-deadline.timer" /etc/systemd/system/kajovo-hotel-release-deadline.timer

# Sudo glob character classes work on the installed older sudo versions, too.
# Repeating the class exactly 40 times forbids spaces and extra arguments.
HOTEL_RELEASE_SUDOERS_TARGET="$staging_dir/kajovo-hotel-release.sudoers" /usr/bin/python3 -I - <<'PYSUDO'
import os
from pathlib import Path
sha = '[a-f0-9]' * 40
commands = ', '.join('/usr/local/bin/kajovo-hotel-release ' + verb + ' ' + sha for verb in ('prepare', 'activate', 'status', 'accept', 'rollback'))
Path(os.environ['HOTEL_RELEASE_SUDOERS_TARGET']).write_text('deploy-hotel ALL=(root) NOPASSWD: ' + commands + '\n')
PYSUDO
visudo -cf "$staging_dir/kajovo-hotel-release.sudoers"
install -o root -g root -m 0440 "$staging_dir/kajovo-hotel-release.sudoers" /etc/sudoers.d/kajovo-hotel-release
systemctl daemon-reload
systemctl enable --now kajovo-hotel-release-deadline.timer
echo "Hotel-only root release controller installed; independent deadline timer enabled"
