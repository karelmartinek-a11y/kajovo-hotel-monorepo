#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/compose.staging.yml}"
ENV_FILE="${ENV_FILE:-infra/.env.staging}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kajovo-staging}"
DEPLOY_NETWORK="${DEPLOY_NETWORK:-deploy_hotelapp_net}"

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

main() {
  [[ -f "$COMPOSE_FILE" ]] || { echo "[VERIFY][FAIL] Missing compose file: $COMPOSE_FILE" >&2; exit 1; }
  [[ -f "$ENV_FILE" ]] || { echo "[VERIFY][FAIL] Missing env file: $ENV_FILE" >&2; exit 1; }

  require_cmd docker
  require_cmd curl

  docker info >/dev/null
  docker compose version >/dev/null

  echo "Kontrola externí docker sítě: $DEPLOY_NETWORK"
  docker network inspect "$DEPLOY_NETWORK" >/dev/null

  echo "Kontrola docker compose stavu"
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT_NAME" \
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

  echo "Kontrola health endpointů"
  curl_check "API /health" "${API_BASE_URL}/health"
  curl_check "API /ready" "${API_BASE_URL}/ready"
  curl_check "WEB /healthz" "${WEB_BASE_URL}/healthz"

  echo "Spouštím smoke testy"
  WEB_BASE_URL="$WEB_BASE_URL" API_BASE_URL="$API_BASE_URL" ./infra/smoke/smoke.sh

  echo "Logy najdete zde:"
  echo "  COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT_NAME docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs --tail=200"
}

main "$@"
