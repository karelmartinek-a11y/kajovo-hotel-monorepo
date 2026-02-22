#!/usr/bin/env bash
set -euo pipefail

WEB_BASE_URL="${WEB_BASE_URL:-http://localhost:8080}"
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-10}"

curl_check() {
  local name="$1"
  local url="$2"

  echo "[SMOKE] $name -> $url"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" "$url")"

  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    echo "[OK] $name ($code)"
  else
    echo "[FAIL] $name returned HTTP $code"
    return 1
  fi
}

main() {
  echo "Running smoke tests"
  echo "WEB_BASE_URL=$WEB_BASE_URL"
  echo "API_BASE_URL=$API_BASE_URL"

  # Required checks
  curl_check "Web home" "$WEB_BASE_URL/"
  curl_check "API health" "$API_BASE_URL/health"

  # One endpoint per module
  curl_check "Snídaně module" "$API_BASE_URL/api/v1/breakfast"
  curl_check "Ztráty a nálezy module" "$API_BASE_URL/api/v1/lost-found"
  curl_check "Závady module" "$API_BASE_URL/api/v1/issues"
  curl_check "Sklad module" "$API_BASE_URL/api/v1/inventory"
  curl_check "Hlášení module" "$API_BASE_URL/api/v1/reports"

  echo "All smoke checks passed."
}

main "$@"
