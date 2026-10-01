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

# Every runtime mutation holds the coordinator's root-owned fence. A worker
# delayed behind rollback must check phase and exact SHA after acquiring it.
TRANSACTION_PUBLIC_DIR="${TRANSACTION_PUBLIC_DIR:-/etc/home-assistant-mcp-public}"
exec 9<"$TRANSACTION_PUBLIC_DIR/runtime.lock"
flock -x 9
TRANSACTION_STATUS="$TRANSACTION_PUBLIC_DIR/transaction.json" DEPLOY_SOURCE_SHA="$DEPLOY_SOURCE_SHA" DEPLOY_ROOT="$ROOT_DIR" python3 - <<'PYFENCE'
import json
import os
from pathlib import Path
state = json.loads(Path(os.environ['TRANSACTION_STATUS']).read_text())
if state.get('phase') != 'active' or state.get('hotel_sha') != os.environ['DEPLOY_SOURCE_SHA']:
    raise SystemExit('Hotel deployment transaction revoked or wrong SHA')
expected_mcp = (Path(os.environ['DEPLOY_ROOT']) / '.coordinated-mcp-sha').read_text().strip()
if len(expected_mcp) != 40 or any(c not in '0123456789abcdef' for c in expected_mcp) or state.get('sha') != expected_mcp:
    raise SystemExit('Hotel deployment reviewed MCP transaction mismatch')
PYFENCE

# The root worker consumes one upload signal. A later transaction must wait for
# fresh preparation rather than accepting a marker left by an older attempt.
trap 'rm -f "$ROOT_DIR/.coordinated-ready"' EXIT

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
  PGPASSWORD="${POSTGRES_PASSWORD:-}" \
    compose_cmd exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "$sql"

  PGPASSWORD="${POSTGRES_PASSWORD:-}" \
    compose_cmd exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
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
  PGPASSWORD="${POSTGRES_PASSWORD:-}" \
    compose_cmd exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "$sql"
}

sync_host_nginx_config() {
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
    cat /tmp/kajovo-deploy-http.txt >&2 || true
    return 1
  fi
  echo "$label PASS ($code)"
}

docker info >/dev/null
docker compose version >/dev/null
docker network inspect "$DEPLOY_NETWORK" >/dev/null

if [[ ! -f "$ENV_FILE" ]]; then
  mkdir -p "$(dirname "$ENV_FILE")"
  : > "$ENV_FILE"
  echo "Chybi $ENV_FILE -> vytvarim prazdny env file a pokracuji s compose defaults."
fi

export POSTGRES_USER="kajovo"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
export POSTGRES_DB="kajovo_hotel"

if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "POSTGRES_PASSWORD je prazdne -> pouziji POSTGRES_HOST_AUTH_METHOD=trust a prihlaseni bez hesla."
  export POSTGRES_HOST_AUTH_METHOD="trust"
  export KAJOVO_API_DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}@kajovo_postgres:5432/${POSTGRES_DB}"
else
  export KAJOVO_API_DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@kajovo_postgres:5432/${POSTGRES_DB}"
fi

cd "$ROOT_DIR"

# Hash and identity checks complete before any current container is stopped.
# Missing/expired CI artifacts fail closed; production never rebuilds a release.
python3 "$ROOT_DIR/scripts/release_images.py" import \
  --directory "$ROOT_DIR/artifacts/release-images" --sha "$DEPLOY_SOURCE_SHA" \
  --compose-output "$COMPOSE_FILE_IMAGES"

if [[ "$SKIP_GIT_SYNC" == "true" ]]; then
  current_branch="$EXPECTED_BRANCH"
  commit_sha="${DEPLOY_SOURCE_SHA:-artifact-without-sha}"
  echo "Deploy branch=$current_branch sha=$commit_sha (artifact mode, git sync skipped)"
else
  git reset --hard HEAD
  git clean -fd
  git fetch origin
  if git show-ref --quiet "refs/heads/$EXPECTED_BRANCH"; then
    git checkout "$EXPECTED_BRANCH"
  else
    git checkout -b "$EXPECTED_BRANCH" "origin/$EXPECTED_BRANCH"
  fi

  git pull --ff-only

  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$current_branch" != "$EXPECTED_BRANCH" ]]; then
    echo "Neocekavana branch: $current_branch (expected $EXPECTED_BRANCH)" >&2
    exit 1
  fi

  if [[ -n "$EXPECTED_TAG" ]] && ! git describe --tags --exact-match >/dev/null 2>&1; then
    echo "Repo neni checkoutnute na release tagu: $EXPECTED_TAG" >&2
    exit 1
  fi

  commit_sha="$(git rev-parse --short HEAD)"
  echo "Deploy branch=$current_branch sha=$commit_sha"
fi

if [[ "$RESET_DB_ON_DEPLOY" != "true" && "$RESET_DB_ON_DEPLOY" != "false" ]]; then
  echo "Neplatna hodnota RESET_DB_ON_DEPLOY='$RESET_DB_ON_DEPLOY' (povoleno: true/false)." >&2
  exit 1
fi

if [[ "$RESET_DB_ON_DEPLOY" == "true" ]]; then
  echo "POZOR: RESET_DB_ON_DEPLOY=true -> provadim destruktivni reset DB volume."
  compose_cmd down -v --remove-orphans || true
  docker volume rm -f "${COMPOSE_PROJECT_NAME}_postgres_data" || true
  docker volume create --name "${COMPOSE_PROJECT_NAME}_postgres_data" >/dev/null
else
  echo "Nedestruktivni deploy: zachovavam databazove volume."
  compose_cmd down --remove-orphans || true
fi

compose_cmd up -d postgres

echo "Cekam na stabilni start Postgresu..."
ready=0
streak=0
for i in {1..60}; do
  if PGPASSWORD="${POSTGRES_PASSWORD:-}" \
     compose_cmd exec -T postgres \
     pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
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

set +e
sql_do="DO \$\$BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$POSTGRES_USER') THEN
    CREATE ROLE $POSTGRES_USER LOGIN SUPERUSER ${POSTGRES_PASSWORD:+PASSWORD '$POSTGRES_PASSWORD'};
  ELSE
    ALTER ROLE $POSTGRES_USER WITH LOGIN ${POSTGRES_PASSWORD:+PASSWORD '$POSTGRES_PASSWORD'};
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '$POSTGRES_DB') THEN
    CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;
  END IF;
END\$\$;"
sql_ok=0
for i in {1..10}; do
  echo "Nastavuji roli a DB (pokus $i/10)..."
  if PGPASSWORD="${POSTGRES_PASSWORD:-}" \
     compose_cmd exec -T postgres \
     psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "$sql_do"; then
    sql_ok=1
    break
  fi
  echo "SQL neproslo, cekam a zkusim znovu ($i/10)..."
  sleep 3
done
set -e
if [[ "$sql_ok" -ne 1 ]]; then
  echo "Nepodarilo se vytvorit roli/databazi po 10 pokusech." >&2
  exit 1
fi

compose_cmd rm -f -s api web admin

set +e
migration_ok=0
for i in {1..10}; do
  echo "Aplikuji Alembic migrace jako jediny zdroj DB schema (pokus $i/10)..."
  has_alembic_version="$(
    PGPASSWORD="${POSTGRES_PASSWORD:-}" \
      compose_cmd exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'alembic_version');" \
      2>/dev/null | tr -d '[:space:]'
  )"
  existing_app_tables="$(
    PGPASSWORD="${POSTGRES_PASSWORD:-}" \
      compose_cmd exec -T postgres \
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
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
  if PGPASSWORD="${POSTGRES_PASSWORD:-}" \
     compose_cmd exec -T postgres \
     pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
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

set +e
sql_ok=0
for i in {1..10}; do
  echo "Final DB sync (pokus $i/10)..."
  if PGPASSWORD="${POSTGRES_PASSWORD:-}" \
     compose_cmd exec -T postgres \
     psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "$sql_do"; then
    sql_ok=1
    break
  fi
  sleep 2
done
set -e
if [[ "$sql_ok" -ne 1 ]]; then
  echo "Final DB sync selhal." >&2
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
