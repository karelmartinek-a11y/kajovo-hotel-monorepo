#!/usr/bin/env bash
set -euo pipefail
if [[ ${EUID} -ne 0 || $# -ne 1 ]]; then
    echo 'Usage (root): activate-release.sh RELEASE_SHA' >&2
    exit 2
fi
release=$1
[[ $release =~ ^[a-f0-9]{7,64}$ ]] || { echo 'Invalid release SHA' >&2; exit 2; }
base=/opt/kajavoiceha
destination=$base/releases/$release
[[ -f $destination/bin/kajavoiceha ]] || { echo 'Release not staged' >&2; exit 2; }
[[ -s /etc/hotel-smart-technologies/ha-token && -s /etc/kajavoiceha/clients.json ]] || { echo 'Missing service credentials' >&2; exit 2; }
sha256sum --check "$destination/SHA256SUMS" >/dev/null
previous=$(readlink "$base/current" 2>/dev/null || true)
temporary=$base/.current.$$
trap 'rm -f -- "$temporary"' EXIT
ln -s "$destination" "$temporary"
mv -Tf -- "$temporary" "$base/current"
install -o root -g root -m 0644 "$destination/deploy/kajavoiceha.service" /etc/systemd/system/kajavoiceha.service
install -o root -g root -m 0644 "$destination/deploy/kajavoiceha-media-cleanup.service" /etc/systemd/system/kajavoiceha-media-cleanup.service
install -o root -g root -m 0644 "$destination/deploy/kajavoiceha-media-cleanup.timer" /etc/systemd/system/kajavoiceha-media-cleanup.timer
systemctl daemon-reload
readiness_credential=${KAJA_READINESS_CREDENTIAL:-/root/kajavoiceha-handoff/pripojeni-voice-chat-01.env}
if systemctl restart kajavoiceha.service && python3 "$destination/deploy/wait-ready.py" --credential "$readiness_credential" && systemctl is-active --quiet kajavoiceha.service; then
    if [[ -n $previous && $previous != "$destination" ]]; then
        ln -s "$previous" "$temporary"
        mv -Tf -- "$temporary" "$base/previous"
    fi
    systemctl enable kajavoiceha.service >/dev/null
    systemctl enable --now kajavoiceha-media-cleanup.timer >/dev/null
    echo "Activated $release. Public HTTPS acceptance remains required."
    exit 0
fi
echo 'Activation failed; restoring only the KajaVoiceHA release.' >&2
if [[ -n $previous && -f $previous/deploy/kajavoiceha.service ]]; then
    ln -s "$previous" "$temporary"
    mv -Tf -- "$temporary" "$base/current"
    install -o root -g root -m 0644 "$previous/deploy/kajavoiceha.service" /etc/systemd/system/kajavoiceha.service
    install -o root -g root -m 0644 "$previous/deploy/kajavoiceha-media-cleanup.service" /etc/systemd/system/kajavoiceha-media-cleanup.service
    install -o root -g root -m 0644 "$previous/deploy/kajavoiceha-media-cleanup.timer" /etc/systemd/system/kajavoiceha-media-cleanup.timer
    systemctl daemon-reload
    systemctl restart kajavoiceha.service
else
    systemctl stop kajavoiceha.service
    rm -f -- "$base/current"
fi
exit 1
