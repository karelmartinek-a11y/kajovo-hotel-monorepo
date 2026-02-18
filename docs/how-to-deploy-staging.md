# Jak nasadit staging (paralelně k legacy)

## 1) Připravte .env.staging

```bash
cd /opt/kajovo-hotel-monorepo/infra
cp .env.staging.example .env.staging
# upravte .env.staging dle prostředí (hesla, hostname)
```

## 2) Build image (staging)

```bash
cd /opt/kajovo-hotel-monorepo
COMPOSE_PROJECT_NAME=kajovo-staging \
  docker compose -f infra/compose.staging.yml --env-file infra/.env.staging build --pull
```

## 3) Spusťte staging stack

```bash
cd /opt/kajovo-hotel-monorepo
COMPOSE_PROJECT_NAME=kajovo-staging \
  docker compose -f infra/compose.staging.yml --env-file infra/.env.staging up -d
```

## 4) Ověřte health endpointy

```bash
curl -fsS https://kajovohotel-staging.hcasc.cz/health
curl -fsS https://kajovohotel-staging.hcasc.cz/ready
curl -fsS https://kajovohotel-staging.hcasc.cz/healthz
```

## 5) Smoke testy proti staging hostu

```bash
cd /opt/kajovo-hotel-monorepo
WEB_BASE_URL="https://kajovohotel-staging.hcasc.cz" \
API_BASE_URL="https://kajovohotel-staging.hcasc.cz" \
./infra/smoke/smoke.sh
```

## 6) Kompletní verifikace (status + health + smoke)

```bash
cd /opt/kajovo-hotel-monorepo
./infra/verify/verify-deploy.sh
```
