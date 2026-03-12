# How to deploy (production)

## Automatizované pipeline

Produkce `hotel.hcasc.cz` se nasazuje z `main` automaticky přes GitHub Actions:

1. Push commit do `main`.
2. `CI Release - Kájovo Hotel` spustí:
   - instalaci závislostí (Node/PNPM, Python),
   - TypeScript lint,
   - backend unit testy (`pnpm unit`),
   - frontend buildy (`@kajovo/kajovo-hotel-web` + `admin`),
   - lehký smoke Playwright (`apps/kajovo-hotel-web/tests/smoke.spec.ts`).
3. Po úspěšném `CI Release` (a pro kompatibilitu také po `CI Full - Kájovo Hotel`) se spustí:
   - `Deploy - hotel.hcasc.cz`

Deploy workflow: `.github/workflows/deploy-production.yml`.

## Nutná GitHub konfigurace

V repo settings musí být vyplněné `secrets` nebo `variables`:

- `HOTEL_DEPLOY_HOST`
- `HOTEL_DEPLOY_PORT`
- `HOTEL_DEPLOY_USER`
- `HOTEL_DEPLOY_KEY` (preferováno) nebo `HOTEL_DEPLOY_PASS`
- `HOTEL_ADMIN_EMAIL`
- `HOTEL_ADMIN_PASSWORD`

Admin přihlášení používá email jako uživatelské jméno, takže hodnota `HOTEL_ADMIN_EMAIL` je zároveň login username.

Volitelné aliasy:

- `KAJOVO_API_ADMIN_EMAIL`
- `KAJOVO_API_ADMIN_PASSWORD`

Pokud aliasy vyplníte, musí mít stejnou hodnotu jako `HOTEL_ADMIN_EMAIL` / `HOTEL_ADMIN_PASSWORD`. GitHub workflow je nyní validuje a bez těchto hodnot už nepoužívá žádný hardcoded fallback.

## Co dělá deploy script na serveru

- synchronizuje `/opt/kajovo-hotel-monorepo` na `origin/main`
- spouští `infra/ops/deploy-production.sh`
- vypíše diagnostické logy kontejnerů (`api`, `postgres`, `admin`, `web`)
- exportuje admin credentialy do `KAJOVO_API_ADMIN_EMAIL` / `KAJOVO_API_ADMIN_PASSWORD` a produkční compose bez nich nespustí API

## Post-deploy ověření

- `https://hotel.hcasc.cz/`
- `https://hotel.hcasc.cz/login`
- `https://hotel.hcasc.cz/admin/login`
- `https://hotel.hcasc.cz/api/health`

## Preview/staging build

Pokud potřebujete aktuální artefakt bez přímého deploye na server, použijte `Preview Build - Kájovo Hotel` (`.github/workflows/preview.yml`). Tato workflow:

- vytvoří buildy pro web i admin,
- zabalí `dist` složky do artefaktů (web-preview.tar.gz, admin-preview.tar.gz),
- upozorní, že nasazení na staging potřebuje správné hosty/credentials (např. `STAGING_DEPLOY_HOST`).

Skutečné staging nasazení zatím běží přes manuální postupy (`docs/how-to-deploy-staging.md`) – automatizované spuštění by vyžadovalo přístup k cílovému serveru (host, uživatel, klíč) a aktuální `infra/compose.staging.yml`.

## Co chybí k úplnému staging deployi

Bez veřejného staging hostu a jeho tajných proměnných nelze automaticky přepnout build z GitHubu na staging. Preview workflow je připravený skelet (vytvoří artefakty), ale finální deploy do `/opt/kajovo-hotel-staging` musí vázat na konkrétní cílové prostředí.
