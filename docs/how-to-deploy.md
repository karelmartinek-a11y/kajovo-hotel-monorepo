# How to deploy (production containers)

## Cíl
Produkční deploy pro `hotel.hcasc.cz` přes compose soubory:
- `infra/compose.prod.yml`
- `infra/compose.prod.hotel-hcasc.yml`

Aplikace musí být připojena do externí docker sítě `deploy_hotelapp_net` a na externí DB endpoint `hotelapp-postgres:5432`.

## 0) Preflight (hard fail)

```bash
command -v docker
docker info
docker compose version
docker network inspect deploy_hotelapp_net
```

Pokud některý příkaz selže, deploy **zastavte**.

## 1) Připravit env

```bash
cd /opt/kajovo-hotel-monorepo/infra
cp .env.example .env
# upravte .env (KAJOVO_API_DATABASE_URL, API_PORT, WEB_PORT, secrets)
```

Doporučený DB endpoint v produkci:

```env
KAJOVO_API_DATABASE_URL=postgresql+psycopg://<user>:<pass>@hotelapp-postgres:5432/<db>
```

## 2) Ověřit branch/tag + commit SHA

```bash
cd /opt/kajovo-hotel-monorepo
git fetch origin
git checkout main
git pull --ff-only
git rev-parse --short HEAD
```

Zapište SHA do deploy ticketu/runbooku.

## 3) Build + up

```bash
cd /opt/kajovo-hotel-monorepo
COMPOSE_PROJECT_NAME=kajovo-prod \
  docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml --env-file infra/.env build --pull

COMPOSE_PROJECT_NAME=kajovo-prod \
  docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml --env-file infra/.env up -d --force-recreate postgres api web admin
```

Alternativa: `infra/ops/deploy-production.sh` (obsahuje hard-fail kontroly).

## 4) Post-deploy smoke + verify

```bash
curl -fsS https://hotel.hcasc.cz/health
curl -fsS https://hotel.hcasc.cz/ready
curl -fsS https://hotel.hcasc.cz/healthz
```

```bash
WEB_BASE_URL="https://hotel.hcasc.cz" API_BASE_URL="https://hotel.hcasc.cz" ./infra/smoke/smoke.sh
./infra/verify/verify-deploy.sh
```

## 5) Rollback sekvence

1. Přepnout reverse proxy na legacy konfiguraci:

```bash
cd /opt/kajovo-hotel-monorepo
NGINX_SITE_PATH=/etc/nginx/conf.d/kajovohotel.conf ./infra/reverse-proxy/rollback-to-legacy.sh
```

2. Ověřit legacy health endpoint.
3. Teprve potom řešit rollback kontejnerů/DB migrace.
