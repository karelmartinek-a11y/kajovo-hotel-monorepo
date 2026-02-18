#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/infra/.env}"
COMPOSE_FILE_BASE="${COMPOSE_FILE_BASE:-$ROOT_DIR/infra/compose.prod.yml}"
COMPOSE_FILE_HOST="${COMPOSE_FILE_HOST:-$ROOT_DIR/infra/compose.prod.hotel-hcasc.yml}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kajovo-prod}"
LOG_FILE="${LOG_FILE:-/var/log/hotelapp/deploy.log}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Chybí $ENV_FILE" >&2
  exit 1
fi

cd "$ROOT_DIR"

git fetch origin
# Ensure main is checked out for production deploys
if git show-ref --quiet refs/heads/main; then
  git checkout main
else
  git checkout -b main origin/main
fi

git pull --ff-only

COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" build --pull

COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" up -d --no-deps api web

postgres_id="$(COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" ps -q postgres || true)"
if [[ -n "$postgres_id" ]]; then
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
    docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" stop postgres
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
    docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" rm -f -v postgres
fi

printf '%s HOTEL web: deploy z monorepa (%s)\n' "$(date '+%F %T')" "$(git rev-parse --short HEAD)" >> "$LOG_FILE"
