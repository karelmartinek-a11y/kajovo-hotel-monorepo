# How to deploy (production containers)

## hotel.hcasc.cz (monorepo source of truth)

Použijte override `infra/compose.prod.hotel-hcasc.yml` a externí DB (stávající `hotelapp-postgres`).

```bash
cd /opt/kajovo-hotel-monorepo/infra
cp .env.example .env
# upravte .env (KAJOVO_API_DATABASE_URL, API_PORT, WEB_PORT)
```

```bash
cd /opt/kajovo-hotel-monorepo
COMPOSE_PROJECT_NAME=kajovo-prod \
  docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml --env-file infra/.env build --pull

COMPOSE_PROJECT_NAME=kajovo-prod \
  docker compose -f infra/compose.prod.yml -f infra/compose.prod.hotel-hcasc.yml --env-file infra/.env up -d
```

Alternativa: použijte skript `infra/ops/deploy-production.sh`.

## 1) Prepare environment

```bash
cd infra
cp .env.example .env
# edit .env with real secrets
```

## 2) Build images

```bash
docker compose -f compose.prod.yml --env-file .env build --pull
```

## 3) Run the stack

```bash
docker compose -f compose.prod.yml --env-file .env up -d
```

## 4) Update deployment (rolling-ish restart)

```bash
cd infra
git pull

docker compose -f compose.prod.yml --env-file .env build --pull api web
docker compose -f compose.prod.yml --env-file .env up -d --no-deps api
docker compose -f compose.prod.yml --env-file .env up -d --no-deps web
docker compose -f compose.prod.yml --env-file .env up -d postgres
```

## 5) DB backup / restore

### Backup

```bash
cd infra
docker compose -f compose.prod.yml --env-file .env exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup.sql
```

### Restore

```bash
cd infra
cat backup.sql | docker compose -f compose.prod.yml --env-file .env exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```
