# Cutover runbook (staging -> produkce)

Tento runbook navazuje na `docs/cutover-plan.md` a definuje kroky cutover pro `hotel.hcasc.cz`.

## 0) Předpoklady

- Staging běží paralelně na `kajovohotel-staging.hcasc.cz`.
- Produkční docker host má dostupné:
  - `docker`, `docker compose`
  - externí síť `deploy_hotelapp_net`
  - DB endpoint `hotelapp-postgres:5432`

## 1) Preflight

```bash
cd /opt/kajovo-hotel-monorepo
git fetch origin
git checkout main
git pull --ff-only
git rev-parse --short HEAD
```

```bash
./infra/verify/verify-deploy.sh
```

```bash
UAT_ACCOUNTS_CHECK=1 ./infra/uat/run-uat.sh
```

## 2) Backup

```bash
cd /opt/kajovo-hotel-monorepo/infra
cp .env.example .env
# upravte .env pro produkci (DB přístup)
```

```bash
cd /opt/kajovo-hotel-monorepo
COMPOSE_PROJECT_NAME=kajovo-prod \
  docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml --env-file infra/.env \
  exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /tmp/kajovo-prod-backup.sql
```

## 3) Deploy

```bash
cd /opt/kajovo-hotel-monorepo
DEPLOY_NETWORK=deploy_hotelapp_net EXPECTED_BRANCH=main ./infra/ops/deploy-production.sh
```

## 4) Post-deploy smoke

```bash
curl -fsS https://hotel.hcasc.cz/health
curl -fsS https://hotel.hcasc.cz/ready
curl -fsS https://hotel.hcasc.cz/healthz
```

```bash
WEB_BASE_URL="https://hotel.hcasc.cz" API_BASE_URL="https://hotel.hcasc.cz" ./infra/smoke/smoke.sh
```

## 5) Monitor

```bash
COMPOSE_PROJECT_NAME=kajovo-prod docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml --env-file infra/.env logs -f --tail=200
```

## 6) Rollback sekvence

1. Přepnout hostname na legacy stack:

```bash
cd /opt/kajovo-hotel-monorepo
NGINX_SITE_PATH=/etc/nginx/conf.d/kajovohotel.conf ./infra/reverse-proxy/rollback-to-legacy.sh
```

2. Ověřit legacy health:

```bash
curl -fsS https://hotel.hcasc.cz/health
```

3. Pokud je potřeba DB rollback, použít poslední validní dump `/tmp/kajovo-prod-backup.sql`.

## 7) Audit záznam

Po každém cutoveru zapište:
- datum/čas,
- commit SHA,
- použité compose soubory,
- výsledek verify + smoke,
- rozhodnutí GO/NO-GO.
