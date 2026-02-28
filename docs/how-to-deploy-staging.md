# Jak nasadit staging (paralelně k legacy)

## Rychlá orientace: co je hotovo vs. co je nasazeno

- **Hotovo v PR větvi** = změna je v commitu na feature větvi.
- **Hotovo v main** = změna je mergnutá do `origin/main`.
- **Nasazeno** = změna běží na serveru (až po deploy kroku + ověření health/smoke).

Rychlá kontrola konkrétního commitu:

```bash
# 1) commit existuje lokálně / v PR větvi
git branch --contains <SHA>

# 2) commit je už v main (po fetchi)
git fetch origin
git branch -r --contains <SHA> | grep origin/main
```

Pokud krok 2 nic nevrátí, změna ještě **není v main**.  
I když je commit v `main`, bez kroků 3–6 v tomto runbooku ještě není považován za **nasazený**.

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
