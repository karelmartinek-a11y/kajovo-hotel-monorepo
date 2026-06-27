# Jak spustit smoke kontroly

Základní shell smoke je v `infra/smoke/smoke.sh`.

## Předpoklady

- běží web
- běží API
- je dostupný `curl`

## Lokální běh

```bash
./infra/smoke/smoke.sh
```

## Pro staging nebo jiný host

```bash
WEB_BASE_URL="https://kajovohotel-staging.hcasc.cz" \
API_BASE_URL="https://kajovohotel-staging.hcasc.cz" \
./infra/smoke/smoke.sh
```

## Důležitá poznámka

Repo používá i Playwright smoke běhy:

- `pnpm ci:web-smoke`
- `pnpm ci:e2e-smoke`
- `python scripts/run_android_smoke.py`

Tyto běhy jsou součást current-state ověření a mají přednost před ručně psaným ad hoc smokem.
