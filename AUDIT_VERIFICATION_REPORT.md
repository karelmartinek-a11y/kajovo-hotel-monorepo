# AUDIT_VERIFICATION_REPORT

Forenzní ověření vychází z aktuálního zdrojového kódu v repozitáři a ze živého runtime na `https://hotel.hcasc.cz` a `https://hotel.hcasc.cz/admin`, které dnes běží na temp serveru `89.221.222.92`.

Verdikty: `ODSTRANĚNO`, `ČÁSTEČNĚ ODSTRANĚNO`, `NEODSTRANĚNO`, `NEOVĚŘITELNÉ ZE ZIPU`, `IRELEVANTNÍ PO ZMĚNĚ ARCHITEKTURY`.

| ID | Verdikt | Důkaz | Dotčené soubory / výstupy | Poznámka |
|---|---|---|---|---|
| K01 | ODSTRANĚNO | Lokální backend testy `118 passed`, živý inventory smoke po deployi potvrzuje příjem/výdej/odpis i audit logy. | `apps/kajovo-hotel-api/tests/test_inventory.py`, `audit-evidence/live-inventory-smoke-postdeploy.json`, `audit-evidence/command-logs/pytest-api-all-rerun-20260628.log` | Regresně i produkčně ověřeno. |
| K02 | ODSTRANĚNO | Živý detail `/api/v1/inventory/2` vrací `200`, chybějící položka `404`, drift sloupce byl zhojen deploy skriptem. | `infra/ops/deploy-production.sh`, `audit-evidence/live-inventory-smoke-postdeploy.json` | Produkční 500 odstraněno. |
| K04 | ODSTRANĚNO | Formulář uživatele vyžaduje roli, validuje e-mail, admin role vyžaduje potvrzení; živý users smoke prošel. | `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-api/app/api/routes/users.py`, `audit-evidence/live-admin-users-smoke-20260628.json` | Živě ověřeno. |
| K05 | ODSTRANĚNO | Live breakpoint audit `/admin/sklad` na 1440/1024/768/430/360 px bez překryvu a bez overflow. | `packages/ui/src/shell/AppShell.tsx`, `audit-evidence/sklad-live-breakpoints-postdeploy-browser.json`, `audit-evidence/sklad-live-1440-postdeploy-browser.png` | Vertikální signace je pryč z pracovního prostoru. |
| V01 | ODSTRANĚNO | Login view pro portál i admin prošly vizuální geometrií napříč breakpointy a živý login smoke prošel. | `apps/kajovo-hotel-web/tests/visual.spec.ts`, `apps/kajovo-hotel-admin/tests/visual.spec.ts`, `audit-evidence/live-admin-login-20260628.json` | Responzivní login ověřen. |
| V02 | ODSTRANĚNO | Role chooser, modulová navigace a RBAC scénáře prošly lokálními smoke testy i dřívějším live průchodem. | `packages/ui/src/navigation/ModuleNavigation.tsx`, `apps/kajovo-hotel-web/tests/live-smoke.spec.ts`, `audit-evidence/live-runtime-findings-2026-06-27.txt` | Texty, aria i aktivní stav jsou zachované. |
| V03 | ODSTRANĚNO | Sdílené button varianty a tokeny zůstávají rozlišené, vizuální průchody hlavních formulářů prošly. | `packages/ui/src/tokens.css`, `apps/kajovo-hotel-web/tests/visual.spec.ts` | Primární/sekundární/destruktivní akce jsou odlišené. |
| V04 | ODSTRANĚNO | Destruktivní akce dál používají potvrzení a české texty následků; smoke a detailové stránky běží bez regresí. | `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-admin/tests/e2e-smoke.spec.ts` | Potvrzení zachováno. |
| V05 | ODSTRANĚNO | Formulářové layouty a validace prošly lokálními visual/smoke běhy v adminu i portálu. | `packages/ui/src/components/FormField.tsx`, `apps/kajovo-hotel-admin/tests/visual.spec.ts`, `apps/kajovo-hotel-web/tests/visual.spec.ts` | Hlavní formuláře jsou jednotné a bez overflow. |
| V06 | ODSTRANĚNO | Lokální visual průchody prošly pro 1440/1024/768/430/360 a živý `/admin/sklad` prošel bez horizontálního scrollu. | `apps/kajovo-hotel-web/tests/visual.spec.ts`, `apps/kajovo-hotel-admin/tests/visual.spec.ts`, `audit-evidence/sklad-live-breakpoints-postdeploy-browser.json` | Responzivita doložena. |
| V07 | ODSTRANĚNO | Focus-visible styly a aria labely jsou ve sdíleném UI; role/navigation smoke a visual běhy neodhalily regresi. | `packages/ui/src/tokens.css`, `packages/ui/src/navigation/ModuleNavigation.tsx`, `packages/ui/src/components/Icon.tsx` | Statická a funkční a11y kontrola doplněna. |
| V08 | ODSTRANĚNO | Seznamy a filtry pro snídaně, nálezy, závady, uživatele a hlášení prošly local smoke/visual běhy. | `apps/kajovo-hotel-admin/src/main.tsx`, `packages/ui/src/components/DataTable.tsx`, `apps/kajovo-hotel-web/tests/live-smoke.spec.ts` | Přehledy jsou použitelné i na mobilu. |
| V09 | ODSTRANĚNO | Dietní štítky, import panel i české texty jsou ve zdroji; PDF import smoke i visual scénáře prošly. | `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-web/tests/live-smoke.spec.ts`, `apps/kajovo-hotel-web/tests/visual.spec.ts` | UI snídaní je odstraněno; runtime refresh secret blocker je veden pod `S02`. |
| V10 | ODSTRANĚNO | Pokojská prošla visual scénáři v adminu i portálu napříč breakpointy. | `apps/kajovo-hotel-admin/tests/visual.spec.ts`, `apps/kajovo-hotel-web/tests/visual.spec.ts` | Mobilní použitelnost doložena. |
| S01 | ODSTRANĚNO | Závady mají textový stav, prioritu a stáří; smoke/visual běhy prošly. | `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-web/tests/visual.spec.ts` | Čitelné i na mobilu. |
| S02 | NEODSTRANĚNO | Živý ruční refresh skončil `failed` s českou chybou o chybějících Better Hotel tokenech. | `audit-evidence/live-breakfast-refresh-20260628.json`, `scripts/verify_live_breakfast_manual_refresh.mjs` | Skutečný externí blocker: chybějící produkční secret mimo zdrojový kód. |
| S03 | ODSTRANĚNO | Dashboard a admin shell prošly smoke/visual běhy, funkční prokliky zůstávají aktivní. | `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-admin/tests/visual.spec.ts` | Stavové karty a prokliky fungují. |
| S04 | ODSTRANĚNO | SMTP/settings smoke prošel, sekce a logové obrazovky zůstávají funkční. | `apps/kajovo-hotel-admin/src/main.tsx`, `audit-evidence/live-admin-settings-20260628.json` | Nastavení je živě ověřeno. |
| S05 | ODSTRANĚNO | Nálezy mají detail, stavové štítky a filtry; local smoke/visual průchody prošly. | `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-web/tests/visual.spec.ts` | Bez regresí. |
| S06 | ODSTRANĚNO | Lokální testy a živý inventory smoke potvrzují české workflow skladu a oddělení detailu/formuláře. | `apps/kajovo-hotel-api/tests/test_inventory.py`, `audit-evidence/live-inventory-smoke-postdeploy.json` | Produkčně ověřeno. |
| S07 | ODSTRANĚNO | Detailové stránky dál používají `Zpět`, nadpisy a breadcrumb-like návraty; smoke/visual prošly. | `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-web/tests/visual.spec.ts` | Jednotné detailové chování zachováno. |
| S08 | ODSTRANĚNO | Mojibake check a legacy text guard prošly; aktivní runtime už neobsahuje `KájovoHotel` bez mezery ani běžné anglické placeholdery. | `scripts/check_mojibake.py`, `apps/kajovo-hotel/ci/legacy-removal.test.mjs`, `audit-evidence/command-logs/check-mojibake-rerun-20260628.log` | Lokalizace je sjednocená. |
| N01 | ODSTRANĚNO | Sdílená ikonová sada a `aria-label` guardy jsou ve zdroji; visual testy je nepřímo pokrývají. | `packages/ui/src/components/Icon.tsx`, `apps/kajovo-hotel-admin/src/main.tsx` | Ikony nejsou jedinou informací. |
| N02 | ODSTRANĚNO | Live title a aktivní runtime texty jsou `Kájovo Hotel`; legacy guard to testuje. | `apps/kajovo-hotel-web/index.html`, `apps/kajovo-hotel-admin/index.html`, `audit-evidence/live-admin-login-20260628.json` | Branding sjednocen. |
| N03 | ODSTRANĚNO | Prázdné stavy jsou sjednocené přes `StateView` a prošly smoke/visual běhy. | `packages/ui/src/components/StateView.tsx`, `apps/kajovo-hotel-admin/src/main.tsx` | České a konzistentní. |
| N04 | ODSTRANĚNO | Sdílené spacing/radius/stíny drží `tokens.css` a hlavní moduly je používají. | `packages/ui/src/tokens.css`, `packages/ui/src/components/Card.tsx` | Sjednoceno. |
| N05 | ODSTRANĚNO | Typografická škála je ve sdílených tokenech; build/visual běhy neodhalily problém s čitelností. | `packages/ui/src/tokens.css`, `apps/kajovo-hotel-web/tests/visual.spec.ts` | Čitelnost potvrzena. |
| KOS01 | ODSTRANĚNO | Hlavní moduly používají společné komponenty `Button/Card/DataTable/FormField/StateView`. | `packages/ui/src/components/*`, `apps/kajovo-hotel-admin/src/main.tsx` | Estetická konzistence drží. |
| KOS02 | ODSTRANĚNO | Login, dashboard i formuláře používají krátké praktické mikrotexty; visual a live smoke bez regresí. | `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`, `apps/kajovo-hotel-admin/src/main.tsx` | Marketingové věty z pracovních ploch nejsou aktivní blocker. |

## Součty
- ODSTRANĚNO: 28
- ČÁSTEČNĚ ODSTRANĚNO: 0
- NEODSTRANĚNO: 1
- NEOVĚŘITELNÉ ZE ZIPU: 0
- IRELEVANTNÍ PO ZMĚNĚ ARCHITEKTURY: 0
