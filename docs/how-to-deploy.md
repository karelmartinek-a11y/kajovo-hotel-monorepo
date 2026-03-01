# How to deploy (production)

## Primární cesta: GitHub Actions

Produkce `hotel.hcasc.cz` se nasazuje z `main` automaticky.

1. Push commit do `main`.
2. Ověř, že proběhlo:
   - `CI Gates - KájovoHotel`
   - `CI Full - Kájovo Hotel`
3. Po úspěšném CI Full se spustí:
   - `Deploy - hotel.hcasc.cz`

Deploy workflow: `.github/workflows/deploy-production.yml`.

## Nutná GitHub konfigurace

V repo settings musí být vyplněné `secrets` (nebo `variables` fallback):

- `HOTEL_DEPLOY_HOST`
- `HOTEL_DEPLOY_PORT`
- `HOTEL_DEPLOY_USER`
- `HOTEL_DEPLOY_KEY` (preferováno) nebo `HOTEL_DEPLOY_PASS`
- `HOTEL_ADMIN_EMAIL`
- `HOTEL_ADMIN_PASSWORD`

## Co dělá deploy script na serveru

- synchronizuje `/opt/kajovo-hotel-monorepo` na `origin/main`
- spouští `infra/ops/deploy-production.sh`
- vypíše diagnostické logy kontejnerů (`api`, `postgres`, `admin`, `web`)

## Post-deploy ověření

- `https://hotel.hcasc.cz/`
- `https://hotel.hcasc.cz/login`
- `https://hotel.hcasc.cz/admin/login`
- `https://hotel.hcasc.cz/api/health`

## Fallback (jen při incidentu)

Manuální server deploy je popsán v:

- `docs/cutover-runbook.md`
- `infra/ops/deploy-production.sh`

Standardní stav je ale CI/CD přes GitHub.
