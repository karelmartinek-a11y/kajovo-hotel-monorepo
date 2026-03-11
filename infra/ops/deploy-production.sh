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
ALLOW_GIT_CLEAN="${ALLOW_GIT_CLEAN:-0}"
ALLOW_DB_REINIT="${ALLOW_DB_REINIT:-0}"
VERIFY_SCRIPT="${VERIFY_SCRIPT:-$ROOT_DIR/infra/verify/verify-deploy.sh}"
RUN_VERIFY_SCRIPT="${RUN_VERIFY_SCRIPT:-1}"
RESET_DB_ON_DEPLOY="${RESET_DB_ON_DEPLOY:-false}"

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Chybi pozadovany command: $name" >&2
    exit 1
  fi
}

compose() {
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" "$@"
}

wait_for_postgres() {
  local ready=0
  local streak=0
  for _ in {1..60}; do
    if PGPASSWORD="${POSTGRES_PASSWORD:-}" compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
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
    compose logs postgres --tail=50 || true
    exit 1
  fi
}

ensure_db_role_and_database() {
  local password_sql=""
  if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
    password_sql="PASSWORD '$POSTGRES_PASSWORD'"
  fi
  local sql_do
  sql_do="DO \$\$BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$POSTGRES_USER') THEN
      CREATE ROLE $POSTGRES_USER LOGIN SUPERUSER $password_sql;
    ELSE
      ALTER ROLE $POSTGRES_USER WITH LOGIN $password_sql;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '$POSTGRES_DB') THEN
      CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;
    END IF;
  END\$\$;"

  local sql_ok=0
  set +e
  for i in {1..10}; do
    echo "Nastavuji roli a DB (pokus $i/10)..."
    if PGPASSWORD="${POSTGRES_PASSWORD:-}" compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "$sql_do"; then
      sql_ok=1
      break
    fi
    sleep 3
  done
  set -e

  if [[ "$sql_ok" -ne 1 ]]; then
    echo "Nepodarilo se vytvorit roli/databazi po 10 pokusech." >&2
    exit 1
  fi
}

require_cmd docker
require_cmd git

docker info >/dev/null
docker compose version >/dev/null
docker network inspect "$DEPLOY_NETWORK" >/dev/null

[[ -f "$ENV_FILE" ]] || { echo "Chybi $ENV_FILE" >&2; exit 1; }
[[ -f "$COMPOSE_FILE_BASE" ]] || { echo "Chybi $COMPOSE_FILE_BASE" >&2; exit 1; }
[[ -f "$COMPOSE_FILE_HOST" ]] || { echo "Chybi $COMPOSE_FILE_HOST" >&2; exit 1; }

export POSTGRES_USER="kajovo"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
export POSTGRES_DB="kajovo_hotel"

if [[ -z "$POSTGRES_PASSWORD" ]]; then
  echo "POSTGRES_PASSWORD je prazdne -> pouziji trust auth."
  export POSTGRES_HOST_AUTH_METHOD="trust"
  export KAJOVO_API_DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}@kajovo_postgres:5432/${POSTGRES_DB}"
else
  export KAJOVO_API_DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@kajovo_postgres:5432/${POSTGRES_DB}"
fi

cd "$ROOT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  if [[ "$ALLOW_GIT_CLEAN" == "1" ]]; then
    echo "Repo je spinave, ALLOW_GIT_CLEAN=1 -> provadim reset a clean."
    git reset --hard HEAD
    git clean -fd
  else
    echo "Repo obsahuje lokalni zmeny. Pro destruktivni cleanup nastavte ALLOW_GIT_CLEAN=1." >&2
    exit 1
  fi
fi

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

if [[ "$RESET_DB_ON_DEPLOY" != "true" && "$RESET_DB_ON_DEPLOY" != "false" ]]; then
  echo "Neplatna hodnota RESET_DB_ON_DEPLOY='$RESET_DB_ON_DEPLOY' (povoleno: true/false)." >&2
  exit 1
fi

if [[ "$ALLOW_DB_REINIT" == "1" || "$RESET_DB_ON_DEPLOY" == "true" ]]; then
  if [[ "$RESET_DB_ON_DEPLOY" == "true" ]]; then
    echo "RESET_DB_ON_DEPLOY=true je pouzite jako kompatibilni alias pro destruktivni reset DB."
  fi
  echo "Provadim destruktivni DB reset."
  compose down -v --remove-orphans || true
  docker volume rm -f "${COMPOSE_PROJECT_NAME}_postgres_data" || true
  docker volume create --name "${COMPOSE_PROJECT_NAME}_postgres_data" >/dev/null
else
  echo "Nedestruktivni deploy: zachovavam databazova volume."
  compose down --remove-orphans || true
fi

compose up -d postgres
wait_for_postgres
ensure_db_role_and_database

echo "Inicializuji DB schema z ORM modelu."
compose run --rm api python -c "from app.db.models import Base; from app.db.session import engine; Base.metadata.create_all(bind=engine)"

compose rm -f -s api web admin || true
compose build --pull
compose up -d --force-recreate api web admin

if [[ "$RUN_VERIFY_SCRIPT" == "1" ]]; then
  echo "Spoustim post-deploy verifikaci."
  "$VERIFY_SCRIPT"
fi

mkdir -p "$(dirname "$LOG_FILE")"
printf '%s HOTEL web: deploy z monorepa (%s, branch=%s)\n' "$(date '+%F %T')" "$commit_sha" "$current_branch" >> "$LOG_FILE"
