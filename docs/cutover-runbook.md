# Cutover runbook (staging -> produkce)

Tento runbook navazuje na `docs/cutover-plan.md` a definuje přesné kroky pro přepnutí provozu a rollback.

## 0) Předpoklady

- Staging běží paralelně na `kajovohotel-staging.hcasc.cz`.
- Reverse proxy je připraveno podle `infra/reverse-proxy/nginx-staging.conf`.
- UAT scénáře a účty jsou připravené: `docs/uat.md` a `docs/test-accounts.md`.

## 1) Preflight

```bash
cd /opt/kajovo-hotel-monorepo
git pull
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
cd /opt/kajovo-hotel-monorepo/infra
COMPOSE_PROJECT_NAME=kajovo-prod \
  docker compose -f compose.prod.yml --env-file .env exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /tmp/kajovo-prod-backup.sql
```

## 3) Migrate

```bash
cd /opt/kajovo-hotel-monorepo
export LEGACY_DB_URL="postgresql+psycopg://<legacy_user>:<legacy_pass>@<legacy_host>:5432/<legacy_db>"
export DATABASE_URL="postgresql+psycopg://<new_user>:<new_pass>@<new_host>:5432/<new_db>"
python apps/kajovo-hotel-api/tools/migrate_legacy/migrate.py \
  --report-json apps/kajovo-hotel-api/tools/migrate_legacy/report.json \
  --report-csv apps/kajovo-hotel-api/tools/migrate_legacy/report.csv
```

## 4) Switch (produkční hostname -> nový stack)

```bash
cd /opt/kajovo-hotel-monorepo
NGINX_SITE_PATH=/etc/nginx/conf.d/kajovohotel.conf \
  ./infra/reverse-proxy/switch-to-new.sh
```

## 5) Verify

```bash
curl -fsS https://kajovohotel.hcasc.cz/health
curl -fsS https://kajovohotel.hcasc.cz/ready
curl -fsS https://kajovohotel.hcasc.cz/healthz
```

```bash
cd /opt/kajovo-hotel-monorepo
WEB_BASE_URL="https://kajovohotel.hcasc.cz" \
API_BASE_URL="https://kajovohotel.hcasc.cz" \
./infra/smoke/smoke.sh
```

```bash
cd /opt/kajovo-hotel-monorepo
./infra/verify/verify-deploy.sh
```

## 6) Monitor

```bash
COMPOSE_PROJECT_NAME=kajovo-prod docker compose -f infra/compose.prod.yml --env-file infra/.env logs -f --tail=200
```

```bash
tail -f /var/log/nginx/access.log
```

## 7) Rollback (produkční hostname -> legacy)

```bash
cd /opt/kajovo-hotel-monorepo
NGINX_SITE_PATH=/etc/nginx/conf.d/kajovohotel.conf \
  ./infra/reverse-proxy/rollback-to-legacy.sh
```

```bash
curl -fsS https://kajovohotel.hcasc.cz/health
```

## Poznámky

- UAT postupy: `docs/uat.md`.
- UAT účty a role: `docs/test-accounts.md`.
- Detailní plán a kritéria GO/NO-GO: `docs/cutover-plan.md`.
