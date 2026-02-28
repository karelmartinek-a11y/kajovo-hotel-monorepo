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

cd "$ROOT_DIR"

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

# Pro jistotu zrusime stare kontejnery, aby nedoslo ke kolizi jmen
COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" rm -f -s api web admin

COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" build --pull

COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
  docker compose -f "$COMPOSE_FILE_BASE" -f "$COMPOSE_FILE_HOST" --env-file "$ENV_FILE" up -d --force-recreate postgres api web admin

printf '%s HOTEL web: deploy z monorepa (%s, branch=%s)\n' "$(date '+%F %T')" "$commit_sha" "$current_branch" >> "$LOG_FILE"
