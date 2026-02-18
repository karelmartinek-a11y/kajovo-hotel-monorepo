#!/usr/bin/env bash
set -euo pipefail

STAGING_HOSTNAME="${STAGING_HOSTNAME:-kajovohotel-staging.hcasc.cz}"
WEB_BASE_URL="${WEB_BASE_URL:-https://${STAGING_HOSTNAME}}"
API_BASE_URL="${API_BASE_URL:-https://${STAGING_HOSTNAME}}"
UAT_RESULT_PATH="${UAT_RESULT_PATH:-infra/uat/uat-result.md}"

ACCOUNT_CHECK_ENDPOINT="${ACCOUNT_CHECK_ENDPOINT:-${API_BASE_URL}/api/v1/reports}"
ACCOUNT_CHECK_TIMEOUT="${ACCOUNT_CHECK_TIMEOUT:-10}"

print_accounts_help() {
  echo "UAT účty nelze automaticky ověřit bez přímé vazby na IdP/SSO."
  echo "Postup vytvoření a doporučené role jsou v docs/test-accounts.md."
  echo "" 
  echo "Pokud chcete provést kontrolu přes hlavičky, spusťte:"
  echo "  UAT_ACCOUNTS_CHECK=1 $0"
}

check_accounts_via_headers() {
  local failed=0

  echo "Kontrola UAT účtů přes auth hlavičky -> $ACCOUNT_CHECK_ENDPOINT"

  declare -a accounts=(
    "uat.admin:admin"
    "uat.recepce:reception"
    "uat.hk:maintenance"
    "uat.sklad:warehouse"
    "uat.audit:manager"
  )

  for entry in "${accounts[@]}"; do
    local username role code
    username="${entry%%:*}"
    role="${entry##*:}"

    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$ACCOUNT_CHECK_TIMEOUT" \
      -H "x-user: ${username}" \
      -H "x-user-id: ${username}" \
      -H "x-user-role: ${role}" \
      "$ACCOUNT_CHECK_ENDPOINT" || true)"

    if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
      echo "[OK] ${username} (${role})"
    else
      echo "[FAIL] ${username} (${role}) -> HTTP ${code}"
      failed=1
    fi
  done

  if [[ "$failed" -ne 0 ]]; then
    echo "UAT účty neprošly kontrolou přes hlavičky."
    return 1
  fi
}

write_uat_result_template() {
  local now
  now="$(date '+%F %T')"

  cat <<TEMPLATE > "$UAT_RESULT_PATH"
# UAT výsledek – ${STAGING_HOSTNAME}

Datum/čas startu: ${now}
Tester: <jméno>
Prostředí: staging
Verze aplikace: <release/sha>

## Odkazy
- UAT scénáře: docs/uat.md
- UAT test účty: docs/test-accounts.md

## Shrnutí
- Celkový výsledek: <PASS/FAIL>
- Blokující problémy: <ano/ne>
- Poznámka: <stručné shrnutí>

## Výsledky scénářů (vyplnit)
| Scénář | Výsledek | Poznámka |
|---|---|---|
| Přehled + utility stavy |  |  |
| Snídaně |  |  |
| Ztráty a nálezy |  |  |
| Závady |  |  |
| Sklad |  |  |
| Hlášení |  |  |
| Cross-module scénáře |  |  |

## Test zařízení
| Device | OK/FAIL | Poznámka |
|---|---|---|
| Telefon |  |  |
| Tablet |  |  |
| Desktop |  |  |

## Incidenty / blokery
- <popis>
TEMPLATE

  echo "UAT template uložen do $UAT_RESULT_PATH"
}

main() {
  echo "UAT staging URL: $WEB_BASE_URL"
  echo "API URL: $API_BASE_URL"

  if [[ "${UAT_ACCOUNTS_CHECK:-0}" == "1" ]]; then
    check_accounts_via_headers
  else
    print_accounts_help
  fi

  echo "Spouštím smoke testy..."
  WEB_BASE_URL="$WEB_BASE_URL" API_BASE_URL="$API_BASE_URL" ./infra/smoke/smoke.sh

  write_uat_result_template
}

main "$@"
