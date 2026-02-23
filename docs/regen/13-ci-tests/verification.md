# ORF-08 Prompt 13 – CI E2E smoke stabilizace

## A) Cíl
- Stabilizovat Playwright smoke v CI pro auth scénáře přes deterministickou orchestrace API služby, explicitní browser instalaci a timeout budget.
- Pokrýt povinné smoke scénáře:
  1. admin login (fixed admin),
  2. hint email flow v mock režimu,
  3. user create + portal login.

## B) Exit criteria
- CI workflow obsahuje dedikovaný `e2e-auth-smoke` job s Playwright browser provisioning.
- Auth smoke běží nad API serverem spuštěným Playwright `webServer` orchestrace.
- Test suite obsahuje přesně 3 povinné scénáře.
- CI job opakuje smoke 3× po sobě pro detekci flake.

## C) Změny
- Přidán samostatný Playwright smoke config pro admin app (`playwright.smoke.config.ts`) s:
  - `workers: 1`, `fullyParallel: false`,
  - timeout budget (`timeout`, `expect.timeout`, `webServer.timeout`),
  - API webServer orchestrace (`seed + uvicorn` na pevném portu).
- Přidán seed nástroj `app.tools.e2e_seed` pro deterministický reset SQLite DB před každým smoke během.
- Přidán smoke test soubor `auth-smoke.spec.ts` s povinnými scénáři ORF-08 Prompt 13.
- Rozšířeny CI workflow (`ci-gates.yml`, `ci-full.yml`) o `e2e-auth-smoke` job:
  - instalace Playwright browseru,
  - 3 sekvenční běhy smoke,
  - env nastavení `KAJOVO_API_DATABASE_URL` a mock email mode (`KAJOVO_API_SMTP_ENABLED=false`).
- Rozšířen npm script v admin app: `test:smoke-auth`.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- FAIL (environment/network blocker): `pnpm --filter @kajovo/kajovo-hotel-admin exec playwright install --with-deps chromium`
  - důvod: síťový/proxy 403 na apt repozitářích.
- FAIL (environment/network blocker): `pnpm --filter @kajovo/kajovo-hotel-admin exec playwright install chromium`
  - důvod: 403 při stažení browser artifactu z CDN.

## E) Rizika / known limits
- V tomto runtime nebylo možné lokálně spustit Playwright smoke kvůli blokovanému downloadu browseru (HTTP 403).
- Stabilita (3× běh bez flake) je implementována přímo v CI jobu, ale její reálné potvrzení musí proběhnout v GitHub Actions runu.

## Flake notes
- Mitigace flake zavedené v tomto promptu:
  - izolovaný SQLite seed před startem API,
  - single-worker režim,
  - explicitní timeout budget,
  - 3× sekvenční execution přímo v CI.
- Potenciální residual flake: externí dostupnost Playwright browser download mirroru v CI prostředí.

## F) Handoff pro další prompt
- Po mergi zkontrolovat nejbližší CI run a uložit run URL + výsledek 3× auth smoke do dalšího `docs/regen/<NN>-*/verification.md` kroku.
- Pokud by browser provisioning v CI flakoval na síti, navázat fix-only promptem pro mirror/cache Playwright browser binaries.
