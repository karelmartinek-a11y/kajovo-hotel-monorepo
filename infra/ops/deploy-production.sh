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
RESET_DB_ON_DEPLOY="${RESET_DB_ON_DEPLOY:-false}"
SKIP_GIT_SYNC="${SKIP_GIT_SYNC:-false}"
DEPLOY_SOURCE_SHA="${DEPLOY_SOURCE_SHA:-}"

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Chybi pozadovany command: $name" >&2
    exit 1
  fi
}

require_cmd docker
if [[ "$SKIP_GIT_SYNC" != "true" ]]; then
  require_cmd git
fi

compose_cmd() {
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
    docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" "$@"
}

docker_build_with_snapshot_retry() {
  local build_log
  local status
  build_log="$(mktemp)"

  set +e
  compose_cmd build --pull 2>&1 | tee "$build_log"
  status=${PIPESTATUS[0]}
  set -e

  if [[ "$status" -eq 0 ]]; then
    rm -f "$build_log"
    return 0
  fi

  if grep -Eq "failed to prepare extraction snapshot|parent snapshot .* does not exist" "$build_log"; then
    echo "Detekovan poskozeny Docker build cache snapshot -> provadim builder/image prune a opakuji build."
    docker builder prune -af || true
    docker image prune -af || true
    compose_cmd build --pull
    rm -f "$build_log"
    return 0
  fi

  rm -f "$build_log"
  return "$status"
}

docker info >/dev/null
docker compose version >/dev/null
docker network inspect "$DEPLOY_NETWORK" >/dev/null

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Chybi $ENV_FILE" >&2
  exit 1
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

docker_build_with_snapshot_retry

set +e
schema_ok=0
for i in {1..10}; do
  echo "Inicializuji DB schema z ORM modelu (pokus $i/10)..."
  if compose_cmd run --rm api \
     python -c "from app.db.models import Base; from app.db.session import engine; Base.metadata.create_all(bind=engine)"; then
    schema_ok=1
    break
  fi
  sleep 2
done
set -e
if [[ "$schema_ok" -ne 1 ]]; then
  echo "Inicializace DB schema selhala." >&2
  exit 1
fi

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

printf '%s HOTEL web: deploy z monorepa (%s, branch=%s)\n' "$(date '+%F %T')" "$commit_sha" "$current_branch" >> "$LOG_FILE"
