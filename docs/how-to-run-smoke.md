# How to run smoke tests

Smoke test script je v `infra/smoke/smoke.sh`.

## Předpoklady

- Běží nový web (default `http://localhost:8080`).
- Běží nové API (default `http://localhost:8000`).
- Je dostupný `curl`.

## Spuštění (default URL)

```bash
./infra/smoke/smoke.sh
```

## Spuštění proti staging hostu

```bash
WEB_BASE_URL="https://kajovohotel-staging.hcasc.cz" \
API_BASE_URL="https://kajovohotel-staging.hcasc.cz" \
./infra/smoke/smoke.sh
```

## Volitelné parametry

- `WEB_BASE_URL` – base URL webu.
- `API_BASE_URL` – base URL API.
- `TIMEOUT_SECONDS` – timeout pro každý HTTP request (default 10s).

## Očekávaný výsledek

- Skript vrací exit code `0`, pokud všechny kontroly vrátí HTTP 2xx.
- Skript vrací non-zero exit code při první selhané kontrole.
