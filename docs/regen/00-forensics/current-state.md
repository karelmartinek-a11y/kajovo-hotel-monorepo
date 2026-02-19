# Aktuální stav monorepa (forenzní zjištění)

## 1) Co je přítomné

### apps/
- `apps/kajovo-hotel-web` — React/Vite SPA s IA routami, RBAC simulací a Playwright sadou.
- `apps/kajovo-hotel-api` — FastAPI CRUD API pro reports/lost_found/issues/breakfast/inventory.
- `apps/kajovo-hotel` — tokeny, UX IA JSON, brand metadata a CI linter skripty.

### packages/
- `packages/ui` — sdílené UI komponenty/tokens.
- `packages/shared` — generovaný API klient + helpery.

## 2) Co je zjevně nekompletní nebo rizikové
- Existuje mismatch mezi legacy baseline (server-side admin+portal+device workflow) a současnou SPA+CRUD strukturou.
- Device provisioning tok není v novém API pokryt parity hloubkou (legacy má challenge/verify životní cyklus).
- Legacy breakfast import přes IMAP + scheduler není v nové vrstvě doložen jako plně ekvivalentní provozní workflow.
- Nový RBAC používá jednoduchý `x-role` header (pomocná mechanika), což není plnohodnotný produkční auth model.
- Současný web obsahuje mnoho modulů najednou, ale parity návaznost na legacy admin/portal route hierarchii je jen částečná.

## 3) Build/generace: proč to není stabilní baseline

### Pozitivní
- Workspace TypeScript lint je průchozí.
- OpenAPI + generace shared klienta + diff check jsou průchozí.

### Selhání / omezení
- E2E testy (`pnpm test`) selhávají v prostředí bez Playwright browser binárek (`chromium_headless_shell` chybí), takže CI gate validace UI parity není lokálně potvrzená.
- Při webserver buildu se objevují CSS minify syntax warningy (`Expected identifier`, `Unexpected var(`), což indikuje nekonzistentní CSS zdroje pro produkční build pipeline.

## 4) Důsledek pro regen plán
- Tento stav nelze považovat za hotový parity výstup.
- Je vhodné postupovat po malých PR: nejdřív explicitní parity kontrakty, pak čistý přepis webu/API podle nich, nakonec tvrdé CI gate ověření.
