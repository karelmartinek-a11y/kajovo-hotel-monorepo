#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/compose.staging.yml}"
ENV_FILE="${ENV_FILE:-infra/.env.staging}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kajovo-staging}"
DEPLOY_NETWORK="${DEPLOY_NETWORK:-deploy_hotelapp_net}"
BACKUP_DIR="${BACKUP_DIR:-infra/backups}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-24}"
REQUIRE_BACKUP="${REQUIRE_BACKUP:-1}"
SMOKE_SCRIPT="${SMOKE_SCRIPT:-./infra/smoke/smoke.sh}"

STAGING_HOSTNAME="${STAGING_HOSTNAME:-kajovohotel-staging.hcasc.cz}"
WEB_BASE_URL="${WEB_BASE_URL:-https://${STAGING_HOSTNAME}}"
API_BASE_URL="${API_BASE_URL:-https://${STAGING_HOSTNAME}}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-10}"

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "[VERIFY][FAIL] Missing required command: $name" >&2
    exit 1
  fi
}

curl_check() {
  local name="$1"
  local url="$2"

  echo "[VERIFY] $name -> $url"
  curl -fsS --max-time "$TIMEOUT_SECONDS" "$url" >/dev/null
}

check_backup_freshness() {
  local newest_file
  newest_file="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql' | sort | tail -n 1)"
  if [[ -z "$newest_file" ]]; then
    echo "[VERIFY][FAIL] No backup .sql file found in $BACKUP_DIR" >&2
    exit 1
  fi

  [[ -f "${newest_file}.sha256" ]] || { echo "[VERIFY][FAIL] Missing checksum file: ${newest_file}.sha256" >&2; exit 1; }
  [[ -f "${newest_file}.json" ]] || { echo "[VERIFY][FAIL] Missing manifest file: ${newest_file}.json" >&2; exit 1; }

  local age_hours
  age_hours="$(python - <<'PY' "$newest_file"
from datetime import datetime, timezone
from pathlib import Path
import sys
p = Path(sys.argv[1])
age = (datetime.now(timezone.utc) - datetime.fromtimestamp(p.stat().st_mtime, timezone.utc)).total_seconds() / 3600
print(f"{age:.2f}")
PY
)"

  python - <<'PY' "$newest_file" "${newest_file}.json" "${newest_file}.sha256" "$age_hours" "$BACKUP_MAX_AGE_HOURS"
from hashlib import sha256
from pathlib import Path
import json
import sys

backup_path = Path(sys.argv[1])
manifest_path = Path(sys.argv[2])
hash_path = Path(sys.argv[3])
age_hours = float(sys.argv[4])
max_age_hours = float(sys.argv[5])

checksum = sha256(backup_path.read_bytes()).hexdigest()
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
hash_value = hash_path.read_text(encoding="utf-8").strip().split()[0].lower()

if checksum != hash_value:
    raise SystemExit(f"[VERIFY][FAIL] Backup checksum mismatch: {backup_path}")
if manifest.get("sha256", "").lower() != checksum:
    raise SystemExit(f"[VERIFY][FAIL] Manifest checksum mismatch: {manifest_path}")
if age_hours > max_age_hours:
    raise SystemExit(f"[VERIFY][FAIL] Latest backup is older than {max_age_hours}h")
PY

  echo "[VERIFY] Latest backup: $newest_file (${age_hours}h old)"
}

main() {
  [[ -f "$COMPOSE_FILE" ]] || { echo "[VERIFY][FAIL] Missing compose file: $COMPOSE_FILE" >&2; exit 1; }
  [[ -f "$ENV_FILE" ]] || { echo "[VERIFY][FAIL] Missing env file: $ENV_FILE" >&2; exit 1; }

  require_cmd docker
  require_cmd curl
  require_cmd python

  docker info >/dev/null
  docker compose version >/dev/null

  if [[ "$REQUIRE_BACKUP" == "1" ]]; then
    [[ -d "$BACKUP_DIR" ]] || { echo "[VERIFY][FAIL] Missing backup directory: $BACKUP_DIR" >&2; exit 1; }
    check_backup_freshness
  fi

  echo "Kontrola externi docker site: $DEPLOY_NETWORK"
  docker network inspect "$DEPLOY_NETWORK" >/dev/null

  echo "Kontrola docker compose stavu"
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

  local running_count
  running_count="$(COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --services --filter status=running | wc -l | tr -d ' ')"
  if [[ "$running_count" -eq 0 ]]; then
    echo "[VERIFY][FAIL] No running compose services detected" >&2
    exit 1
  fi

  echo "Kontrola health endpointu"
  curl_check "API /health" "${API_BASE_URL}/health"
  curl_check "API /ready" "${API_BASE_URL}/ready"
  curl_check "WEB /healthz" "${WEB_BASE_URL}/healthz"

  echo "Spoustim smoke testy"
  [[ -x "$SMOKE_SCRIPT" ]] || { echo "[VERIFY][FAIL] Smoke script is not executable: $SMOKE_SCRIPT" >&2; exit 1; }
  WEB_BASE_URL="$WEB_BASE_URL" API_BASE_URL="$API_BASE_URL" "$SMOKE_SCRIPT"

  echo "Logy najdete zde:"
  echo "  COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT_NAME docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs --tail=200"
}

main "$@"
