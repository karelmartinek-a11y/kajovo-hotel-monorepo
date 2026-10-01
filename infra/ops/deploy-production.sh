#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/infra/.env}"
COMPOSE_FILE_BASE="${COMPOSE_FILE_BASE:-$ROOT_DIR/infra/compose.prod.yml}"
COMPOSE_FILE_HOST="${COMPOSE_FILE_HOST:-$ROOT_DIR/infra/compose.prod.hotel-hcasc.yml}"
COMPOSE_FILE_IMAGES="$ROOT_DIR/artifacts/release-images/compose.images.yml"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kajovo-prod}"
DEPLOY_NETWORK="${DEPLOY_NETWORK:-deploy_hotelapp_net}"
LOG_FILE="${LOG_FILE:-/var/log/hotelapp/deploy.log}"
EXPECTED_BRANCH="${EXPECTED_BRANCH:-main}"
EXPECTED_TAG="${EXPECTED_TAG:-}"
ALLOW_GIT_CLEAN="${ALLOW_GIT_CLEAN:-0}"
ALLOW_DB_REINIT="${ALLOW_DB_REINIT:-0}"
VERIFY_SCRIPT="${VERIFY_SCRIPT:-$ROOT_DIR/infra/verify/verify-deploy.sh}"
RUN_VERIFY_SCRIPT="${RUN_VERIFY_SCRIPT:-1}"
RESET_DB_ON_DEPLOY="${RESET_DB_ON_DEPLOY:-false}"
SKIP_GIT_SYNC="${SKIP_GIT_SYNC:-false}"
DEPLOY_SOURCE_SHA="${DEPLOY_SOURCE_SHA:-}"
HOST_NGINX_TEMPLATE="${HOST_NGINX_TEMPLATE:-$ROOT_DIR/infra/reverse-proxy/production-host.conf}"
HOST_NGINX_SITE_PATH="${HOST_NGINX_SITE_PATH:-/etc/nginx/sites-available/hotel.hcasc.cz.conf}"
HOST_NGINX_ENABLED_PATH="${HOST_NGINX_ENABLED_PATH:-/etc/nginx/sites-enabled/hotel.hcasc.cz.conf}"
HOST_NGINX_SYNC_HELPER="${HOST_NGINX_SYNC_HELPER:-/usr/local/bin/kajovo-sync-hotel-nginx}"

# Root rollback revokes the nonce before stopping the entire worker cgroup.
# Delayed processes must recheck this state under the root-owned runtime fence.
HOTEL_RELEASE_RUNTIME_LOCK="${HOTEL_RELEASE_RUNTIME_LOCK:?Missing hotel runtime fence}"
HOTEL_RELEASE_STATE_FILE="${HOTEL_RELEASE_STATE_FILE:?Missing hotel transaction}"
export HOTEL_RELEASE_SHA HOTEL_RELEASE_ID HOTEL_RELEASE_STATE_FILE DEPLOY_SOURCE_SHA
exec 9<"$HOTEL_RELEASE_RUNTIME_LOCK"
flock -x 9

check_release_fence() {
  python3 - <<'PYFENCE'
import json, os, time
from pathlib import Path
state = json.loads(Path(os.environ['HOTEL_RELEASE_STATE_FILE']).read_text())
sha = os.environ['DEPLOY_SOURCE_SHA']
if (state.get('phase') != 'active' or state.get('sha') != sha
        or sha != os.environ['HOTEL_RELEASE_SHA']
        or state.get('transaction_id') != os.environ['HOTEL_RELEASE_ID']
        or state.get('deadline_epoch', 0) <= time.time()):
    raise SystemExit('Hotel deployment transaction revoked, expired or wrong identity')
PYFENCE
}
check_release_fence
if [[ "$RESET_DB_ON_DEPLOY" != "false" || "$ALLOW_DB_REINIT" != "0" || "$SKIP_GIT_SYNC" != "true" ]]; then
  echo "Managed immutable deployment forbids source sync and database reset" >&2
  exit 1
fi

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Chybi pozadovany command: $name" >&2
    exit 1
  fi
}

require_cmd docker
require_cmd curl
require_cmd tar
require_cmd mktemp
if [[ "$SKIP_GIT_SYNC" != "true" ]]; then
  require_cmd git
fi

compose_cmd() {
  check_release_fence || return $?
  if [[ "${1:-}" == "up" ]]; then
    shift
    COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
      docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" -f "$COMPOSE_FILE_IMAGES" \
      --env-file "$ENV_FILE" up --no-build "$@"
  else
    COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
      docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" -f "$COMPOSE_FILE_IMAGES" \
      --env-file "$ENV_FILE" "$@"
  fi
}

postgres_cmd() {
  compose_cmd exec -T postgres sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec "$@"' -- "$@"
}

wait_for_container_health() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local elapsed=0
  while [[ "$elapsed" -lt "$timeout_seconds" ]]; do
    local container_id
    container_id="$(compose_cmd ps -q "$service")"
    if [[ -n "$container_id" ]]; then
      local health
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$health" == "healthy" || "$health" == "running" ]]; then
        echo "$service healthy ($health)"
        return 0
      fi
      echo "Waiting for $service health, current=$health"
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo "Service $service did not become healthy in ${timeout_seconds}s" >&2
  return 1
}

prepare_api_media_volume() {
  echo "Pripravuji zapisovatelny /app/data volume pro API..."
  compose_cmd up -d api
  compose_cmd exec -T --user root api sh -lc '
    mkdir -p /app/data/media/issues /app/data/media/lost-found /app/data/media/reports /app/data/media/inventory
    chown -R appuser:appuser /app/data
  '
}

reconcile_runtime_schema() {
  local sql
  # Dorovname stary produkcni schema drift u SMTP tabulky i v pripade,
  # kdy byla databaze drive adoptovana pomoci `alembic stamp head`.
  sql="$(cat <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'portal_smtp_settings'
  ) THEN
    ALTER TABLE public.portal_smtp_settings
      ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS last_test_connected BOOLEAN NULL,
      ADD COLUMN IF NOT EXISTS last_test_send_attempted BOOLEAN NULL,
      ADD COLUMN IF NOT EXISTS last_test_success BOOLEAN NULL,
      ADD COLUMN IF NOT EXISTS last_test_recipient VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS last_test_error TEXT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'inventory_movements'
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD COLUMN IF NOT EXISTS card_id INTEGER NULL,
      ADD COLUMN IF NOT EXISTS card_item_id INTEGER NULL,
      ADD COLUMN IF NOT EXISTS quantity_pieces INTEGER NOT NULL DEFAULT 0;
  END IF;
END
$$;
SQL
)"

  echo "Dorovnavam kompatibilni runtime schema drift..."
  postgres_cmd psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "$sql"

  postgres_cmd psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE INDEX IF NOT EXISTS ix_inventory_movements_card_id
  ON public.inventory_movements (card_id);
CREATE INDEX IF NOT EXISTS ix_inventory_movements_card_item_id
  ON public.inventory_movements (card_item_id);
SQL
}

reconcile_alembic_version_storage() {
  local sql
  sql="$(cat <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'alembic_version'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'alembic_version'
        AND column_name = 'version_num'
        AND COALESCE(character_maximum_length, 0) < 128
    ) THEN
      ALTER TABLE public.alembic_version
        ALTER COLUMN version_num TYPE VARCHAR(128);
    END IF;
  END IF;
END
$$;
SQL
)"

  echo "Dorovnavam uloziste Alembic revizi pro delsi revision ID..."
  postgres_cmd psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "$sql"
}

sync_host_nginx_config() {
  check_release_fence || return $?
  if [[ ! -f "$HOST_NGINX_TEMPLATE" ]]; then
    echo "Chybi host-level Nginx sablona: $HOST_NGINX_TEMPLATE" >&2
    exit 1
  fi

  echo "Synchronizuji host-level Nginx konfiguraci pro hotel.hcasc.cz..."
  if [[ "$(id -u)" -eq 0 ]]; then
    install -D -m 0644 "$HOST_NGINX_TEMPLATE" "$HOST_NGINX_SITE_PATH"
    if [[ ! -L "$HOST_NGINX_ENABLED_PATH" ]]; then
      ln -sfn "$HOST_NGINX_SITE_PATH" "$HOST_NGINX_ENABLED_PATH"
    fi
    nginx -t
    systemctl reload nginx
    return 0
  fi

  if [[ -x "$HOST_NGINX_SYNC_HELPER" ]] && sudo -n "$HOST_NGINX_SYNC_HELPER" \
    "$HOST_NGINX_TEMPLATE" \
    "$HOST_NGINX_SITE_PATH" \
    "$HOST_NGINX_ENABLED_PATH"; then
    return 0
  fi

  echo "Deploy uzivatel nema prava pro host-level Nginx sync a helper $HOST_NGINX_SYNC_HELPER neni dostupny pres sudo -n." >&2
  exit 1
}

http_check() {
  local url="$1"
  local label="$2"
  local expected="${3:-200}"
  local code
  code="$(curl -sS -o /tmp/kajovo-deploy-http.txt -w '%{http_code}' --max-time 10 "$url" || true)"
  if [[ "$code" != "$expected" ]]; then
    echo "$label failed: expected HTTP $expected got $code" >&2
    return 1
  fi
  echo "$label PASS ($code)"
}

docker info >/dev/null
docker compose version >/dev/null
docker network inspect "$DEPLOY_NETWORK" >/dev/null

test -f "$ENV_FILE"
cd "$ROOT_DIR"
# Hash and identity checks complete before any current container is stopped.
python3 "$ROOT_DIR/scripts/release_images.py" import \
  --directory "$ROOT_DIR/artifacts/release-images" --sha "$DEPLOY_SOURCE_SHA" \
  --compose-output "$COMPOSE_FILE_IMAGES"

# Compose parses the literal quoted private env; never source it as shell code.
# --environment exposes interpolation values without re-escaping $ for serialization.
database_env="$(mktemp)"
chmod 600 "$database_env"
if ! ENV_FILE="$ENV_FILE" COMPOSE_FILE_BASE="$COMPOSE_FILE_BASE" COMPOSE_FILE_HOST="$COMPOSE_FILE_HOST" python3 - <<'PYDB' > "$database_env"
import os, subprocess, sys
result = subprocess.run(['docker', 'compose', '-f', os.environ['COMPOSE_FILE_BASE'],
                         '-f', os.environ['COMPOSE_FILE_HOST'], '--env-file', os.environ['ENV_FILE'],
                         'config', '--environment'], capture_output=True)
if result.returncode:
    raise SystemExit('Private production environment validation failed')
values = dict(line.split('=', 1) for line in result.stdout.decode().splitlines() if '=' in line)
required = ('POSTGRES_USER', 'POSTGRES_DB', 'POSTGRES_PASSWORD')
if any(key not in values for key in required) or not values['POSTGRES_USER'] or not values['POSTGRES_DB']:
    raise SystemExit('Preserved production database environment required')
for key in required:
    sys.stdout.buffer.write(key.encode() + b'\0' + values[key].encode() + b'\0')
PYDB
then
  rm -f "$database_env"
  exit 1
fi
while IFS= read -r -d '' key && IFS= read -r -d '' value; do
  export "$key=$value"
done < "$database_env"
rm -f "$database_env"

current_branch="main"
commit_sha="$DEPLOY_SOURCE_SHA"
echo "Deploy branch=main sha=$commit_sha (verified immutable artifact)"
compose_cmd down --remove-orphans

compose_cmd up -d postgres

echo "Cekam na stabilni start Postgresu..."
ready=0
streak=0
for i in {1..60}; do
  if postgres_cmd pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
    streak=$((streak + 1))
    if [[ "$streak" -ge 3 ]]; then
      ready=1
      break
    fi
  else
    streak=0
  fi
  sleep 2
done

if [[ "$ready" -ne 1 ]]; then
  echo "Postgres neni stabilne dostupny ani po 120 s" >&2
  compose_cmd logs postgres --tail=50 || true
  exit 1
fi

compose_cmd rm -f -s api web admin

set +e
migration_ok=0
for i in {1..10}; do
  echo "Aplikuji Alembic migrace jako jediny zdroj DB schema (pokus $i/10)..."
  has_alembic_version="$(
    postgres_cmd psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'alembic_version');" \
      2>/dev/null | tr -d '[:space:]'
  )"
  existing_app_tables="$(
    postgres_cmd psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'alembic_version';" \
      2>/dev/null | tr -d '[:space:]'
  )"
  if [[ "$has_alembic_version" != "t" && "${existing_app_tables:-0}" =~ ^[0-9]+$ && "${existing_app_tables:-0}" -gt 0 ]]; then
    echo "Detekovano existujici schema bez alembic_version -> adoptuji schema pomoci alembic stamp head."
    if ! compose_cmd run --rm api alembic stamp head; then
      sleep 2
      continue
    fi
  fi
  if [[ "$has_alembic_version" == "t" ]]; then
    if ! reconcile_alembic_version_storage; then
      sleep 2
      continue
    fi
  fi
  if compose_cmd run --rm api alembic upgrade head; then
    migration_ok=1
    break
  fi
  sleep 2
done
set -e
if [[ "$migration_ok" -ne 1 ]]; then
  echo "Aplikace Alembic migraci selhala." >&2
  exit 1
fi

reconcile_runtime_schema

compose_cmd up -d --force-recreate postgres

echo "Overuji DB po recreate postgres..."
ready=0
streak=0
for i in {1..60}; do
  if postgres_cmd pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
    streak=$((streak + 1))
    if [[ "$streak" -ge 3 ]]; then
      ready=1
      break
    fi
  else
    streak=0
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  echo "Postgres po recreate neni stabilne dostupny ani po 120 s" >&2
  exit 1
fi

compose_cmd up -d --force-recreate api web admin
prepare_api_media_volume
sync_host_nginx_config

wait_for_container_health postgres 180
wait_for_container_health api 180
wait_for_container_health web 180
wait_for_container_health admin 180

http_check "http://127.0.0.1:${API_PORT:-8202}/ready" "API readiness"
http_check "http://127.0.0.1:${API_PORT:-8202}/api/health" "API health"
http_check "http://127.0.0.1:${WEB_PORT:-8080}/healthz" "Web health"
http_check "http://127.0.0.1:${ADMIN_PORT:-8083}/healthz" "Admin health"

deploy_artifact_dir="$ROOT_DIR/artifacts/deploy-runtime"
mkdir -p "$deploy_artifact_dir"
cat > "$deploy_artifact_dir/latest.json" <<JSON
{
  "deployed_at": "$(date -u +%FT%TZ)",
  "branch": "$current_branch",
  "sha": "$commit_sha",
  "artifact_mode": "$SKIP_GIT_SYNC",
  "checks": {
    "postgres": "healthy",
    "api_ready": "200",
    "api_health": "200",
    "web_healthz": "200",
    "admin_healthz": "200"
  }
}
JSON

DEPLOY_ROOT="$ROOT_DIR" COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" python3 - <<'PYIMAGES'
import json
import os
import subprocess
from pathlib import Path
root = Path(os.environ['DEPLOY_ROOT'])
manifest = json.loads((root / 'artifacts/release-images/manifest.json').read_text())
names = [os.environ['COMPOSE_PROJECT_NAME'] + '-' + name + '-1' for name in ['api', 'web', 'admin']]
rows = json.loads(subprocess.check_output(['docker', 'inspect', *names]))
for service, row in zip(['api', 'web', 'admin'], rows, strict=True):
    if row['Image'] != manifest['images'][service]['id']:
        raise SystemExit('Running image differs from tested CI image')
path = root / 'artifacts/deploy-runtime/latest.json'
payload = json.loads(path.read_text())
payload['images'] = manifest['images']
payload['image_archive_sha256'] = manifest['archive_sha256']
path.write_text(json.dumps(payload, indent=2) + '\n')
print('Running exact tested production image identities PASS')
PYIMAGES

printf '%s HOTEL web: deploy z monorepa (%s, branch=%s)\n' "$(date '+%F %T')" "$commit_sha" "$current_branch" >> "$LOG_FILE"
