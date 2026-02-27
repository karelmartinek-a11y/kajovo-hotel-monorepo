# Verification — 00-forensics (pr-merge refresh)

## Cíl

- Vytvořit forenzní inventury legacy a nového systému.
- Vytvořit brand/panel inventory + mapu panelových zadání na route/view.
- Vytvořit deterministickou parity mapu a backlog GAP/rizik.
- Explicitně potvrdit: Device modul = DROPPED a žádné `/device/*` ani Entity ID flow v novém cíli.

## Jak ověřeno

1. Výpis souborů a relevantních cest:
   - `rg --files legacy | sed -n '1,260p'`
   - `rg --files docs | sed -n '1,240p'`
   - `rg --files | head -n 200`

2. Evidence rout/endpointů:
   - `rg -n "@(router|app)\.(get|post|put|delete|patch)\(" legacy/hotel-backend/app/api legacy/hotel-backend/app/web legacy/hotel-frontend/routes.py legacy/hotel-frontend/routes_admin.py | sed -n '1,260p'`
   - `rg "@(router|app)\.(get|post|put|patch|delete)" apps/kajovo-hotel-api/app -n`
   - `rg "createBrowserRouter|Routes|Route|path:\s*'|path:\s*\"" apps/kajovo-hotel-web/src -n`

3. Evidence datových entit:
   - `rg "^class " legacy/hotel-backend/app/db/models.py apps/kajovo-hotel-api/app/db/models.py -n`

4. Ověření absence `/device/*` v novém cíli:
   - `rg -n "(/device/|\bdevice\b|Entity ID|entity id)" apps/kajovo-hotel-api apps/kajovo-hotel-web docs | head -n 200`

## Co se změnilo

- Přidány forenzní dokumenty do `docs/regen/00-forensics/`.
- Přidána deterministická parity mapa `docs/regen/parity/parity-map.yaml`.
- Přidán prioritizovaný backlog `docs/regen/00-forensics/parity-backlog.md`.

## Rizika / known limits

- Brand/panel mapování je forenzní (souborové + route evidence), bez pixel-perfect vizuální validace.
- Stav parity pro auth/admin-portal split je evidenční; implementace ještě není provedena.
