# ORF-15 View states auth catch fix Verification

## A) Cíl

Opravit zbývající regresi `ci:view-states` tím, že fallback v `AppRoutes` při rejectu `resolveAuthProfile()` použije read permissions místo prázdné sady.

## B) Exit criteria

- `AppRoutes` catch fallback nenastavuje `permissions: new Set()`.
- Fallback používá `rolePermissions('manager')`.
- `pnpm lint`, `pnpm typecheck`, `pnpm unit` prochází.

## C) Změny

- `apps/kajovo-hotel-web/src/rbac.ts`: export `rolePermissions` helper.
- `apps/kajovo-hotel-web/src/main.tsx`: v catch fallbacku `resolveAuthProfile()` použit `permissions: rolePermissions('manager')`.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- WARNING (env blocker): `pnpm ci:view-states` lokálně blokováno chybějícím Playwright browser binary.

## E) Rizika / known limits

- Plná e2e verifikace zůstává navázána na CI prostředí s browser instalací.

## F) Handoff pro další prompt

- Zachovat jednotný fallback zdroj přes `rolePermissions()`; nevracet prázdnou sadu permissions v route bootstrappingu.
