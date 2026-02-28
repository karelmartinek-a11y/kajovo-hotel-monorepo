#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/infra/.env}"
COMPOSE_FILE_BASE="${COMPOSE_FILE_BASE:-$ROOT_DIR/infra/compose.prod.yml}"
COMPOSE_FILE_HOST="${COMPOSE_FILE_HOST:-$ROOT_DIR/infra/compose.prod.hotel-hcasc.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kajovo-prod}"
DEPLOY_NETWORK="${DEPLOY_NETWORK:-deploy_hotelapp_net}"
LOG_FILE="${LOG_FILE:-/var/log/hotelapp/deploy.log}"
EXPECTED_BRANCH="${EXPECTED_BRANCH:-main}"
EXPECTED_TAG="${EXPECTED_TAG:-}"

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Chybí požadovaný command: $name" >&2
    exit 1
  fi
}

require_cmd docker
require_cmd git

docker info >/dev/null
docker compose version >/dev/null
docker network inspect "$DEPLOY_NETWORK" >/dev/null

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Chybí $ENV_FILE" >&2
  exit 1
fi

# Default/override DB creds pro jednotné nasazení – vynuceně
export POSTGRES_USER="kajovo"
export POSTGRES_PASSWORD="Slunicko1"
export POSTGRES_DB="kajovo_hotel"
export KAJOVO_API_DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"

cd "$ROOT_DIR"

git reset --hard HEAD
git clean -fd
git fetch origin
# Ensure main is checked out for production deploys
if git show-ref --quiet "refs/heads/$EXPECTED_BRANCH"; then
  git checkout "$EXPECTED_BRANCH"
else
  git checkout -b "$EXPECTED_BRANCH" "origin/$EXPECTED_BRANCH"
fi

git pull --ff-only

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$EXPECTED_BRANCH" ]]; then
  echo "Neočekávaná branch: $current_branch (expected $EXPECTED_BRANCH)" >&2
  exit 1
fi

if [[ -n "$EXPECTED_TAG" ]] && ! git describe --tags --exact-match >/dev/null 2>&1; then
  echo "Repo není checkoutnuté na release tagu: $EXPECTED_TAG" >&2
  exit 1
fi

commit_sha="$(git rev-parse --short HEAD)"
echo "Deploy branch=$current_branch sha=$commit_sha"

# Zastavíme případně běžící kontejnery a smažeme VŠECHNY lokální volume z compose (i postgres_data).
# Pokud existoval starý cluster s jiným heslem, vznikala chyba autentizace API -> PostgreSQL.
COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" down -v --remove-orphans || true

# Smažeme (a hned vytvoříme) naše postgres volume, abychom měli čistý start.
docker volume rm -f "${COMPOSE_PROJECT_NAME}_postgres_data" || true
docker volume create --name "${COMPOSE_PROJECT_NAME}_postgres_data" >/dev/null
# Pro jistotu vyčistíme obsah volume (kdyby docker volume rm neprošel) a ověříme prázdnotu
docker run --rm -v "${COMPOSE_PROJECT_NAME}_postgres_data":/var/lib/postgresql/data alpine sh -c 'rm -rf /var/lib/postgresql/data/* /var/lib/postgresql/data/.* 2>/dev/null || true' >/dev/null
if docker run --rm -v "${COMPOSE_PROJECT_NAME}_postgres_data":/var/lib/postgresql/data alpine sh -c 'find /var/lib/postgresql/data -mindepth 1 -maxdepth 1 | read'; then
  echo "Volume ${COMPOSE_PROJECT_NAME}_postgres_data není prázdný, ruším deploy." >&2
  exit 1
fi

# Nejprve připrav DB heslo, aby API healthcheck prošel
COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" up -d postgres

# Po startu počkáme na dostupnost Postgresu a pak nastavíme heslo.
echo "Čekám na start Postgresu..."
ready=0
for i in {1..20}; do
  if COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
     docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" exec -T postgres \
     pg_isready -U "$POSTGRES_USER" -d postgres; then
    ready=1
    break
  fi
  sleep 3
done

if [[ "$ready" -ne 1 ]]; then
  echo "Postgres není připraven ani po 30 s" >&2
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
    docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" logs postgres --tail=50 || true
  exit 1
fi

# Nastav heslo pro hlavního uživatele DB (POSTGRES_USER) s retriem,
# protože initdb krátce restartuje server a zakládá DB.
set +e
sql_do="DO $$BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$POSTGRES_USER') THEN
    CREATE ROLE \\\"$POSTGRES_USER\\\" LOGIN SUPERUSER PASSWORD '$POSTGRES_PASSWORD';
  ELSE
    ALTER ROLE \\\"$POSTGRES_USER\\\" WITH LOGIN PASSWORD '$POSTGRES_PASSWORD';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '$POSTGRES_DB') THEN
    CREATE DATABASE \\\"$POSTGRES_DB\\\" OWNER \\\"$POSTGRES_USER\\\";
  END IF;
END$$;"
for i in {1..5}; do
  echo "Nastavuji roli a DB (pokus $i/5)..."
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
    docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "$sql_do" && break
  echo "SQL neprošlo, čekám a zkusím znovu ($i/5)..."
  sleep 3
done
set -e

# Pro jistotu zrusime stare kontejnery, aby nedoslo ke kolizi jmen
COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" rm -f -s api web admin

COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" build --pull

COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" up -d --force-recreate postgres api web admin

printf '%s HOTEL web: deploy z monorepa (%s, branch=%s)\n' "$(date '+%F %T')" "$commit_sha" "$current_branch" >> "$LOG_FILE"
