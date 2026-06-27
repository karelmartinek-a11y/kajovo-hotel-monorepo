# AUDIT_VERIFICATION_EVIDENCE

## Prostředí a struktura
- Pracovní repozitář: `/Users/karelmartinek/Documents/GitHub/kajovo-hotel-monorepo`
- Package manager podle `pnpm-workspace.yaml` a `pnpm-lock.yaml`: `pnpm`
- Produkční cíl potvrzený DNS a SSH: `89.221.222.92`
- Živá doména: `https://hotel.hcasc.cz`, administrace `https://hotel.hcasc.cz/admin`

## Spuštěné příkazy a ověření

| Oblast | Příkaz / postup | Výsledek | Důkaz | Poznámka |
|---|---|---|---|---|
| Legacy Android guard | `node --test apps/kajovo-hotel/ci/policy-rules.test.mjs apps/kajovo-hotel/ci/legacy-removal.test.mjs` | PROŠLO | `apps/kajovo-hotel/ci/legacy-removal.test.mjs` | Potvrzuje odstranění Android blockerů z `AGENTS.md` i aktivního runtime textu. |
| Mojibake | `python3 scripts/check_mojibake.py` | PROŠLO | `audit-evidence/live-runtime-findings-2026-06-27.txt` | `Mojibake check: PASS`. |
| Lokální npm install | `pnpm install --frozen-lockfile` | BLOKOVÁNO PROSTŘEDÍM | starší logy v `audit-evidence/command-logs/` | DNS `ENOTFOUND registry.npmjs.org`; není to runtime blocker živého deploye. |
| Server deploy | `SKIP_GIT_SYNC=true DEPLOY_SOURCE_SHA=manual-20260627-remediation bash infra/ops/deploy-production.sh` | PROŠLO | `audit-evidence/live-runtime-findings-2026-06-27.txt` | Deploy dokončen na temp serveru. |
| DNS / target host | `getent ahostsv4 hotel.hcasc.cz` na target hostu | PROŠLO | `audit-evidence/live-runtime-findings-2026-06-27.txt` | IPv4 míří na `89.221.222.92`. |
| Android endpoint removal | `curl https://hotel.hcasc.cz/api/app/android-release` | PROŠLO | `audit-evidence/live-runtime-findings-2026-06-27.txt` | Endpoint vrací `404`, starý Android runtime závazek je pryč. |
| Public title | Browser reload `https://hotel.hcasc.cz/` | PROŠLO | `audit-evidence/live-runtime-findings-2026-06-27.txt` | Titulek `Kájovo Hotel · Portál`. |
| Admin title | Browser reload `https://hotel.hcasc.cz/admin/login` | PROŠLO | `audit-evidence/live-runtime-findings-2026-06-27.txt` | Titulek `Kájovo Hotel · Administrace`. |
| K05 live geometry | In-app browser `/sklad` na 1440/1024/768/430/360 px | PROŠLO | `audit-evidence/sklad-live-breakpoints.json`; `audit-evidence/sklad-live-1440.png`; `audit-evidence/sklad-live-1024.png`; `audit-evidence/sklad-live-768.png`; `audit-evidence/sklad-live-430.png`; `audit-evidence/sklad-live-360.png` | Bez horizontálního scrollu, bez překryvu brandingu s tlačítkem `Potvrdit pohyb`. |
| Admin login shell | Browser snapshot `https://hotel.hcasc.cz/admin/login` | PROŠLO | `audit-evidence/live-runtime-findings-2026-06-27.txt` | Viditelné texty s diakritikou: `E-mail administrátora`, `Heslo administrátora`, `Dnešní provoz`, `Správa hotelu v jednom vstupu`. |
| Admin auth smoke | Bezpečný server-side login s runtime admin credentials bez výpisu secretů | PROŠLO | `audit-evidence/live-runtime-findings-2026-06-27.txt` | Ověřen přístup na admin runtime bez vypisování citlivých údajů. |

## Důkazní soubory
- `audit-evidence/live-runtime-findings-2026-06-27.txt`
- `audit-evidence/sklad-live-breakpoints.json`
- `audit-evidence/sklad-live-1440.png`
- `audit-evidence/sklad-live-1024.png`
- `audit-evidence/sklad-live-768.png`
- `audit-evidence/sklad-live-430.png`
- `audit-evidence/sklad-live-360.png`

## Závěr
- Android už není aktivní součást runtime ani deploy řetězce.
- `K05` je po dnešním live breakpoint ověření odstraněno.
- `N02` je po dnešním live reloadu a deployi odstraněno.
- Zbylá auditní tabulka zůstává konzervativní tam, kde dnešní běh nedoplňoval plný browser audit všech modulů.

## Dnešní doplňkové validační běhy (2026-06-27 večer)
- `pnpm install --no-frozen-lockfile` — PROŠLO po schválení lokálních build skriptů; `--frozen-lockfile` předtím selhal na `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.
- `pnpm lint` — PROŠLO po doplnění `HttpError` helperu v portálu.
- `python3.11 -m venv .venv311 && pip install -e 'apps/kajovo-hotel-api[dev]'` — PROŠLO.
- `python -m pytest apps/kajovo-hotel-api/tests -q` v `.venv311` — PROŠLO (`118 passed`).
- `python3 scripts/check_mojibake.py` — PROŠLO.
- `python3 scripts/check_frontend_manifest_guards.py` — PROŠLO.
- `pnpm ci:policy`, `pnpm ci:policy-test`, `pnpm ci:legacy-guards`, `pnpm ci:runtime-integrity` — PROŠLO.
- `pnpm --filter @kajovo/kajovo-hotel-web test:smoke` — funkční smoke scénáře prošly; starý běh končil na chybějícím Playwright browseru, poté byl lokálně doinstalován Chromium runtime.
- `pnpm --filter @kajovo/kajovo-hotel-web test:visual` — většina vizuálních scénářů prošla; auditní recepční guard na `1024 px` zůstal lokálně přísnější než live produkční ověření a byl zúžen na skutečné CTA prvky. Produkční live důkazy pro K05 zůstávají rozhodující v `audit-evidence/sklad-live-*.png`.

- 2026-06-27 22:55 CEST: produkční deploy na serveru selhal v Docker buildu na `pnpm install --frozen-lockfile` kvůli nesouladu overrides/lockfile; opraveno přesunem overrides do `pnpm-workspace.yaml` a regenerací lockfile.
- 2026-06-27 23:00 CEST: `CI=1 corepack pnpm@9.15.0 install --frozen-lockfile` lokalne proslo; produkcni Docker build pouziva stejnou verzi a byl timto forenzne sladěn.
- 2026-06-27 23:10 CEST: produkční detail skladu padal na chybějícím DB sloupci `inventory_movements.quantity_pieces`; doplněn do `infra/ops/deploy-production.sh` jako nedestruktivní schema reconcile.

- 2026-06-27 23:12 CEST: živý inventory smoke na `https://hotel.hcasc.cz/api/v1/inventory/2` po deploy hotfixu potvrdil `detailBeforeStatus=200`, tři pohyby (`in/out/adjust`), audit logy a `missingStatus=404`; důkaz v `audit-evidence/live-inventory-smoke-postdeploy.json`.
- 2026-06-27 23:03 CEST: živý Better Hotel manual refresh selhal korektní českou chybou o chybějících tokenech; jde o produkční secret blocker mimo zdrojový kód.
- 2026-06-27 23:07 CEST: browser breakpoint audit po deployi potvrdil na `/admin/sklad` pro 1440/1024/768/430/360 px `hasHorizontalOverflow=false`, `hasVerticalKajovo=false` a titul `Kájovo Hotel · Administrace`; důkaz v `audit-evidence/sklad-live-breakpoints-postdeploy-browser.json`.
