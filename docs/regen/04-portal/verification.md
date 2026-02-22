# Verification — 04 Portal

## A) Cíl
Auditovatelně uzavřít Prompt 04 doplněním evidence pro Portal route coverage podle IA (route -> komponenta -> stav -> test).

## B) Exit criteria
- Existuje `docs/regen/04-portal/route-coverage.md` s mapou IA route -> komponenta -> stav -> test.
- Existuje tento verification záznam se sekcemi A-F.
- `docs/regen/parity/parity-map.yaml` obsahuje explicitní link na Prompt 04 evidenci.
- Základní quality gates (lint + typecheck + unit) jsou spuštěné a výsledek je zdokumentovaný.

## C) Změny
- **Plan + Evidence scope**:
  1. Načíst SSOT pro IA (`apps/kajovo-hotel/ux/ia.json`) a portal routes (`apps/kajovo-hotel-web/src/main.tsx`).
  2. Spárovat IA views/modules na konkrétní route komponenty.
  3. Spárovat každou route s existujícím test evidence (`ci-gates`, `nav-robustness`, `rbac-access`).
  4. Zapsat coverage matrix do `docs/regen/04-portal/route-coverage.md`.
  5. Aktualizovat parity mapu o link na prompt evidence.
- Vytvořen soubor `docs/regen/04-portal/route-coverage.md`.
- Aktualizována parity mapa o modul evidence pro Prompt 04.

## D) Ověření (přesné příkazy + PASS/FAIL)
- FAIL (env/deps): `pnpm lint`
- FAIL (env/deps): `pnpm typecheck`
- PASS: `pnpm unit`

## E) Rizika / known limits
- Coverage je evidence-level mapování (dokumentace); nepřidává nové runtime chování.
- Test references ukazují na existující suite, která je integrační/E2E; route-level unit testy nejsou vedené samostatně pro každou stránku.
- `pnpm lint` a `pnpm typecheck` aktuálně padají na `apps/kajovo-hotel-admin` kvůli chybějícím `node_modules` (missing dependencies v prostředí běhu).

## F) Handoff pro další prompt
- Prompt 05 navázat stejným stylem evidencí pro Admin shell: panel design -> admin route/view + verification A-F.
- Po případných změnách route layoutu držet `route-coverage.md` synchronní s `apps/kajovo-hotel-web/src/main.tsx` a IA.
