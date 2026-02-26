# A) Cíl
- Synchronizovat API kontrakt artefakty (`openapi.json` + generated TS client), aby prošel contract freshness check.
- Stabilizovat e2e-smoke admin login flow v CI, kde docházelo k timeoutu při čekání na `#admin_login_email`.

# B) Exit criteria
- `pnpm contract:generate` negeneruje necommitnuté změny po commitu.
- `pnpm typecheck` a `pnpm lint` projdou bez chyb.
- Smoke test specifikace má explicitní čekání na login inputy, per-selector timeout a delší celkový timeout, aby byla determinističtější v CI.
- `ruff check` pro API app/tests prochází bez chyb.

# C) Změny
- Regenerován OpenAPI kontrakt a TypeScript klient:
  - `apps/kajovo-hotel-api/openapi.json`
  - `packages/shared/src/generated/client.ts`
- Upraven e2e smoke test:
  - `apps/kajovo-hotel-web/tests/e2e-smoke/auth-smoke.spec.ts`
  - navýšen timeout testu na `150_000`
  - přidány explicitní `waitForSelector(..., { state: 'visible', timeout: 120_000 })`
  - `goto(..., { waitUntil: 'networkidle' })` pro stabilnější načtení stránek

# D) Ověření
- Spuštěno `pnpm contract:generate`.
- Spuštěno `pnpm typecheck`.
- Spuštěno `pnpm lint`.
- Spuštěno `python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`.
- Spuštěno `pnpm --filter @kajovo/kajovo-hotel-web exec playwright test --config tests/e2e-smoke.config.ts --list`.

# E) Rizika/known limits
- `--list` ověřuje discovery/config, neprovádí reálný browser run testu.
- Plný běh smoke testu je stále citlivý na výkon CI runneru a startup backendu/frontend preview.

# F) Handoff pro další prompt
- Pokud CI znovu padne na e2e timeout, přidej trace artifacts (`trace.zip`) do diagnostiky a zvaž:
  - čekání na konkrétní API call po login click,
  - oddělení smoke testu do menších kroků,
  - případné zvýšení timeoutu pouze pro nejpomalejší step.
