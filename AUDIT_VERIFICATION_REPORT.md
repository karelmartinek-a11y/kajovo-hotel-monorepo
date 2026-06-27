# AUDIT_VERIFICATION_REPORT

Forenzní ověření vychází z aktuálního zdrojového kódu v repozitáři a ze živého runtime na `https://hotel.hcasc.cz` a `https://hotel.hcasc.cz/admin`, které dnes běží na temp serveru `89.221.222.92`.

Verdikty: `ODSTRANĚNO`, `ČÁSTEČNĚ ODSTRANĚNO`, `NEODSTRANĚNO`, `NEOVĚŘITELNÉ ZE ZIPU`, `IRELEVANTNÍ PO ZMĚNĚ ARCHITEKTURY`.

| ID | Verdikt | Důkaz | Dotčené soubory / výstupy | Poznámka |
|---|---|---|---|---|
| K01 | ODSTRANĚNO | Backend trasy a testy pro IN/OUT/ADJUST; dnešní serverový deploy a živý `/sklad` smoke nic nerozbily. | `apps/kajovo-hotel-api/app/api/routes/inventory.py`, `apps/kajovo-hotel-api/tests/test_inventory.py` | Regresně zachováno. |
| K02 | ODSTRANĚNO | Detail položky má guardy na chybějící data a nevrací syrový `Internal Server Error`. | `apps/kajovo-hotel-api/app/api/routes/inventory.py`, `apps/kajovo-hotel-admin/src/main.tsx` | Regresně zachováno. |
| K04 | ODSTRANĚNO | Formulář uživatele vyžaduje roli, validuje e-mail a potvrzuje admin práva. | `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-api/app/api/routes/users.py` | Regresně zachováno. |
| K05 | ODSTRANĚNO | Live breakpoint audit `/sklad` na 1440/1024/768/430/360 px: `brandOverlapsButton=false`, `hasHorizontalOverflow=false`. | `packages/ui/src/shell/AppShell.tsx`, `packages/ui/src/index.ts`, `audit-evidence/sklad-live-breakpoints.json` | Vertikální signace byla odstraněna z aktivního shellu. |
| V01 | ČÁSTEČNĚ ODSTRANĚNO | Login shelly byly zjednodušené a live portál/admin login běží bez starého Android panelu. | `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`, `apps/kajovo-hotel-admin/src/main.tsx` | Dnešní běh neudělal plný screenshot audit všech login breakpointů. |
| V02 | ODSTRANĚNO | Role chooser a navigace rolí byly živě ověřené v prohlížeči. | `packages/ui/src/navigation/ModuleNavigation.tsx`, `audit-evidence/live-runtime-findings-2026-06-27.txt` | Aktivní role i mobilní menu zůstávají funkční. |
| V03 | ODSTRANĚNO | Varianty tlačítek zůstávají rozlišené přes sdílené tokeny. | `packages/ui/src/tokens.css` | Regresně zachováno. |
| V04 | ODSTRANĚNO | Potvrzení destruktivních akcí zůstávají v admin UI. | `apps/kajovo-hotel-admin/src/main.tsx` | Regresně zachováno. |
| V05 | ČÁSTEČNĚ ODSTRANĚNO | Sdílený `FormField` a serverová validace existují, ale nebyl udělán plný živý průřez všemi formuláři. | `packages/ui/src/components/FormField.tsx`, `apps/kajovo-hotel-admin/src/main.tsx` | Konzervativní ponechání. |
| V06 | ČÁSTEČNĚ ODSTRANĚNO | `/sklad` live bez overflow na všech povinných šířkách; ostatní moduly dnes jen zdrojově. | `audit-evidence/sklad-live-breakpoints.json` | Konzervativní ponechání. |
| V07 | ČÁSTEČNĚ ODSTRANĚNO | Focus/aria guardy ve zdroji zůstávají, ale chybí plný dnešní keyboard/contrast audit. | `packages/ui/src/navigation/ModuleNavigation.tsx`, `packages/ui/src/components/StateView.tsx` | Konzervativní ponechání. |
| V08 | ČÁSTEČNĚ ODSTRANĚNO | Filtry a responzivní seznamy jsou ve zdroji, ale neproběhl plný živý audit všech seznamů. | `apps/kajovo-hotel-admin/src/main.tsx`, `packages/ui/src/components/DataTable.tsx` | Konzervativní ponechání. |
| V09 | ČÁSTEČNĚ ODSTRANĚNO | Snídaně mají zdrojové úpravy a refresh smoke prošel. | `apps/kajovo-hotel-admin/src/main.tsx`, `scripts/verify_live_breakfast_manual_refresh.mjs` | Chybí plný živý vizuální audit dietní legendy. |
| V10 | ČÁSTEČNĚ ODSTRANĚNO | Pokojská zůstává zdrojově upravená; dnešní běh ji neprošel celou v browseru. | `apps/kajovo-hotel-admin/src/main.tsx` | Konzervativní ponechání. |
| S01 | ČÁSTEČNĚ ODSTRANĚNO | Závady mají čitelné štítky a stáří, ale bez dnešního plného live průchodu. | `apps/kajovo-hotel-admin/src/main.tsx` | Konzervativní ponechání. |
| S02 | ČÁSTEČNĚ ODSTRANĚNO | Import/sync snídaní prošel refresh smoke, ale ne plný ruční upload flow v browseru. | `scripts/verify_live_breakfast_manual_refresh.mjs` | Konzervativní ponechání. |
| S03 | ČÁSTEČNĚ ODSTRANĚNO | Dashboard zdrojově nabízí stavové karty; dnešní běh ověřil admin shell a auth, ne plný interaktivní průřez. | `apps/kajovo-hotel-admin/src/main.tsx` | Konzervativní ponechání. |
| S04 | ČÁSTEČNĚ ODSTRANĚNO | Nastavení/logy zůstávají zdrojově členěné; SMTP smoke prošel. | `apps/kajovo-hotel-admin/src/main.tsx`, `scripts/verify_live_admin_settings.mjs` | Konzervativní ponechání. |
| S05 | ČÁSTEČNĚ ODSTRANĚNO | Nálezy mají stavové štítky a detail, ale ne dnešní plný live průchod. | `apps/kajovo-hotel-admin/src/main.tsx` | Konzervativní ponechání. |
| S06 | ČÁSTEČNĚ ODSTRANĚNO | Skladový formulář a pohyby jsou oddělené; live ověřeno hlavně K05. | `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-api/tests/test_inventory.py` | Konzervativní ponechání. |
| S07 | ČÁSTEČNĚ ODSTRANĚNO | Jednotné návraty/detailové nadpisy jsou ve zdroji, ne plně živě projité. | `apps/kajovo-hotel-admin/src/main.tsx` | Konzervativní ponechání. |
| S08 | ODSTRANĚNO | Mojibake check prošel a aktivní runtime texty už neobsahují `KájovoHotel` bez mezery. | `scripts/check_mojibake.py`, `apps/kajovo-hotel/ci/legacy-removal.test.mjs` | Aktivní texty sjednoceny. |
| N01 | ČÁSTEČNĚ ODSTRANĚNO | Sdílená ikona a labely zůstávají, ale bez plného živého průřezu všech ikonových akcí. | `packages/ui/src/components/Icon.tsx` | Konzervativní ponechání. |
| N02 | ODSTRANĚNO | Live tituly `Kájovo Hotel · Portál` a `Kájovo Hotel · Administrace`; Android release endpoint odstraněn. | `apps/kajovo-hotel-web/index.html`, `apps/kajovo-hotel-admin/index.html`, `audit-evidence/live-runtime-findings-2026-06-27.txt` | Aktivní runtime branding je sjednocen. |
| N03 | ČÁSTEČNĚ ODSTRANĚNO | Prázdné stavy jsou ve zdroji, ale ne všechny dnes živě ověřené. | `packages/ui/src/components/StateView.tsx` | Konzervativní ponechání. |
| N04 | ČÁSTEČNĚ ODSTRANĚNO | Sdílené spacing/radius/stíny zůstávají ve zdroji. | `packages/ui/src/tokens.css` | Konzervativní ponechání. |
| N05 | ČÁSTEČNĚ ODSTRANĚNO | Typografické tokeny zůstávají, ale bez plného dnešního čtecího auditu všech seznamů. | `packages/ui/src/tokens.css` | Konzervativní ponechání. |
| KOS01 | ČÁSTEČNĚ ODSTRANĚNO | Sdílené UI komponenty jsou použité, ale ne celý systém dnes browserově projitý. | `packages/ui/src/components/*` | Konzervativní ponechání. |
| KOS02 | ČÁSTEČNĚ ODSTRANĚNO | Login a branding mikrotexty jsou praktičtější; neproběhl plný obsahový audit všech modulů. | `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`, `apps/kajovo-hotel-admin/src/main.tsx` | Konzervativní ponechání. |

## Součty
- ODSTRANĚNO: 9
- ČÁSTEČNĚ ODSTRANĚNO: 20
- NEODSTRANĚNO: 0
- NEOVĚŘITELNÉ ZE ZIPU: 0
- IRELEVANTNÍ PO ZMĚNĚ ARCHITEKTURY: 0
