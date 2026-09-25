# SSOT current state

## Aktivní architektura

- `apps/kajovo-hotel-web` je veřejný a provozní portál na `https://hotel.hcasc.cz`.
- `apps/kajovo-hotel-admin` je administrace na `https://hotel.hcasc.cz/admin`.
- `apps/kajovo-hotel-api` je FastAPI backend s OpenAPI exportem v `apps/kajovo-hotel-api/openapi.json`.
- `packages/shared` drží RBAC, i18n a generovaný API klient v `packages/shared/src/generated/client.ts`.
- `packages/ui` drží sdílený shell a UI komponenty.
- Přihlášené aplikace používají `AppShell`: desktopový postranní panel a přichycené záhlaví na tabletu a mobilu. Profil má stálý samostatný odkaz; odkazy na sekce vycházejí z oprávnění a na úzké obrazovce se posouvají uvnitř navigačního řádku. Podrobnosti jsou v `docs/ui-navigation.md`.

## Runtime a bezpečnost

- API registruje routy `auth`, `health`, `reports`, `breakfast`, `device`, `lost_found`, `issues`, `inventory`, `users`, `settings` a `profile`.
- Autentizace běží přes session cookie `kajovo_session` a CSRF cookie `kajovo_csrf` s hlavičkou `x-csrf-token`.
- Nová webová přihlášení portálu i administrace obnovují session pouze po uživatelské aktivitě přes CSRF chráněný `POST /api/auth/activity`. Po 48 hodinách bez aktivity session vyprší; běžné načítání dat dobu neprodlužuje. Starší session zůstanou platné do svého původního vypršení bez obnovování a nativní Android používá původní samostatný režim.
- Portál používá `cs`, `en` a `uk`, s preferencí uloženou u účtu přes `PATCH /api/auth/locale`. Přihlašovací stránka začíná vždy česky. Administrace zůstává česky. PDF exporty portálu používají jazyk účtu.
- RBAC kontrakt je sdílený mezi backendem a frontendy přes `packages/shared/src/rbac.ts`.
- Produkční compose stack používá `infra/compose.prod.yml` a host override `infra/compose.prod.hotel-hcasc.yml`.

## CI a deploy

- Hlavní CI workflow je `.github/workflows/ci-gates.yml`.
- Produkční deploy workflow je `.github/workflows/deploy-production.yml` a spouští se jen po úspěšném CI na `main`.
- Deploy vytváří archiv `kajovo-deploy-<sha>.tar.gz`, nahrává jej na produkční server a ověřuje runtime artifact i živé smoke scénáře.
- Produkční server pro `hotel.hcasc.cz` se ověřuje proti IPv4 `89.221.222.92`.

## Povinné validace

- `pnpm typecheck`
- `pnpm ci:portal-translations`
- `python3.11 -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- `pnpm unit`
- `pnpm contract:check`
- `pnpm ci:gates`
- `python3.11 scripts/release_gate.py`
- live ověření přes `scripts/verify_live_breakfast_overview.mjs`, `scripts/verify_live_admin_login.mjs` a `scripts/verify_live_admin_users_smoke.mjs`
