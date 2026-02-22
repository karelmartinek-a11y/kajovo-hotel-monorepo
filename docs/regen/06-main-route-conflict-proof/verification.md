# Verification – 06 main-route-conflict-proof

## cíl
Odstranit konfliktové místo v `apps/kajovo-hotel-web/src/main.tsx` při PR merge a zachovat Admin/Portal split.

## co se změnilo
- Přesunuta route logika do samostatných souborů:
  - `apps/kajovo-hotel-web/src/admin/AdminRoutes.tsx`
  - `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`
- `apps/kajovo-hotel-web/src/main.tsx` nyní pouze skládá route stromy a předává závislosti.
- Zachováno oddělení:
  - `/admin/login` + `/admin/*` (admin tree)
  - `/login` + ostatní routy (portal tree)

## jak ověřeno
- `pnpm -C apps/kajovo-hotel-web lint`
  - očekávaný výsledek: bez TypeScript chyb.
- `pnpm -C apps/kajovo-hotel-web build`
  - očekávaný výsledek: úspěšný produkční build.

## rizika/known limits
- Reálný GitHub konflikt závisí na tom, jaké změny jsou současně v cílové base větvi; tato změna výrazně zmenšuje konfliktový povrch `main.tsx`.
