#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 || $# -ne 3 ]]; then
    echo 'Usage (root): install.sh BINARY CATALOG_JSON RELEASE_SHA' >&2
    exit 2
fi
binary=$1
catalog=$2
release=$3
[[ $release =~ ^[a-f0-9]{7,64}$ ]] || { echo 'Invalid release SHA' >&2; exit 2; }
[[ -f $binary && -f $catalog ]] || { echo 'Missing binary or catalog' >&2; exit 2; }
python3 -c 'import json,sys; json.load(open(sys.argv[1],encoding="utf-8"))' "$catalog"
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
python3 "$script_dir/backend-media.py" --operation prepare
base=/opt/kajavoiceha
destination=$base/releases/$release
[[ ! -e $destination ]] || { echo 'Release exists; immutable release will not be overwritten' >&2; exit 2; }
getent group kajavoiceha >/dev/null || groupadd --system kajavoiceha
getent passwd kajavoiceha >/dev/null || useradd --system --gid kajavoiceha --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin kajavoiceha
install -d -o root -g kajavoiceha -m 0750 "$base" "$base/releases" "$destination" "$destination/bin" "$destination/deploy" /etc/kajavoiceha
install -o root -g kajavoiceha -m 0550 "$binary" "$destination/bin/kajavoiceha"
install -o root -g kajavoiceha -m 0640 "$catalog" "$destination/catalog.json"
install -o root -g kajavoiceha -m 0640 "$script_dir/kajavoiceha.service" "$destination/deploy/kajavoiceha.service"
install -o root -g kajavoiceha -m 0640 "$script_dir/kajavoiceha-media-cleanup.service" "$destination/deploy/kajavoiceha-media-cleanup.service"
install -o root -g kajavoiceha -m 0640 "$script_dir/kajavoiceha-media-cleanup.timer" "$destination/deploy/kajavoiceha-media-cleanup.timer"
install -o root -g kajavoiceha -m 0550 "$script_dir/backend-media.py" "$destination/deploy/backend-media.py"
install -o root -g kajavoiceha -m 0550 "$script_dir/wait-ready.py" "$destination/deploy/wait-ready.py"
if [[ ! -e /etc/kajavoiceha/catalog.json && ! -L /etc/kajavoiceha/catalog.json ]]; then
    ln -s "$base/current/catalog.json" /etc/kajavoiceha/catalog.json
fi
install -d -o root -g root -m 0755 /var/lib/kajavoiceha-acme
sha256sum "$destination/bin/kajavoiceha" "$destination/catalog.json" > "$destination/SHA256SUMS"
chmod 0640 "$destination/SHA256SUMS"
chown root:kajavoiceha "$destination/SHA256SUMS"
echo "Staged immutable release $release. Service and nginx were not restarted."
