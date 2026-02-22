# Verification — 05 Admin shell

## A) Cíl
Auditovatelně uzavřít Prompt 05 doplněním evidence mapy panel design -> admin route/view.

## B) Exit criteria
- Existuje `docs/regen/05-admin-shell/nav-map.md` s mapou panel asset -> admin route/view.
- Existuje tento verification záznam se sekcemi A-F.
- `docs/regen/parity/parity-map.yaml` obsahuje explicitní link na Prompt 05 evidenci.
- Základní quality gates (lint + typecheck + unit) jsou spuštěné a výsledek je zdokumentovaný.

## C) Změny
- **Plan + Evidence scope**:
  1. Načíst panelové podklady z `brand/panel/*`.
  2. Načíst admin routing a view komponenty z `apps/kajovo-hotel-admin/src/main.tsx`.
  3. Spárovat panel design intent na route/view v admin shellu.
  4. Zapsat mapování do `docs/regen/05-admin-shell/nav-map.md`.
  5. Aktualizovat parity mapu o link na prompt evidence.
- Vytvořen soubor `docs/regen/05-admin-shell/nav-map.md`.
- Aktualizována parity mapa o modul evidence pro Prompt 05.

## D) Ověření (přesné příkazy + PASS/FAIL)
- FAIL (env/deps): `pnpm lint`
- FAIL (env/deps): `pnpm typecheck`
- PASS: `pnpm unit`

## E) Rizika / known limits
- Nav map je evidence-layer dokument; sám o sobě nemění behavior navigace.
- Některé panelové varianty reprezentují roli/scénář (recepční/pokojská/údržba), které jsou v nové architektuře mapovány přes RBAC nad společnou route sadou.
- `pnpm lint` a `pnpm typecheck` aktuálně padají na `apps/kajovo-hotel-admin` kvůli chybějícím `node_modules` (missing dependencies v prostředí běhu).

## F) Handoff pro další prompt
- Při každé změně admin routingu doplnit/aktualizovat `nav-map.md`, aby panel asset mapa zůstala auditovatelná.
- Pokud se změní naming panel assetů v `brand/panel`, provést re-map a přidat diff do parity evidence.
