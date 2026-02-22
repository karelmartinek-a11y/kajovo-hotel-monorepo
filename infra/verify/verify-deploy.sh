#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-infra/compose.staging.yml}"
ENV_FILE="${ENV_FILE:-infra/.env.staging}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-kajovo-staging}"

STAGING_HOSTNAME="${STAGING_HOSTNAME:-kajovohotel-staging.hcasc.cz}"
WEB_BASE_URL="${WEB_BASE_URL:-https://${STAGING_HOSTNAME}}"
API_BASE_URL="${API_BASE_URL:-https://${STAGING_HOSTNAME}}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-10}"

curl_check() {
  local name="$1"
  local url="$2"

  echo "[VERIFY] $name -> $url"
  curl -fsS --max-time "$TIMEOUT_SECONDS" "$url" >/dev/null
}

main() {
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
