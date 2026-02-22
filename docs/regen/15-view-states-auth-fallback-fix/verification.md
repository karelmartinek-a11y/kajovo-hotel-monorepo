# ORF-15 View states auth fallback fix Verification

## A) Cíl

Opravit fail `ci:view-states` (`Missing loading state on /snidane`) způsobený tím, že při neúspěšném `/api/auth/me` byl profil bez read permissions a route skončila v AccessDenied místo state view.

## B) Exit criteria

- `resolveAuthProfile()` při neúspěšném `/api/auth/me` vrací fallback read permissions pro roli manager.
- Pokud API vrátí roli bez `permissions`, klient doplní default read permissions podle role.
- `pnpm lint`, `pnpm typecheck`, `pnpm unit` prochází.

## C) Změny

- `apps/kajovo-hotel-web/src/rbac.ts`:
  - přidána mapa `ROLE_READ_PERMISSIONS` a helper `rolePermissions(role)`.
  - fallback profil pro neúspěšné `/api/auth/me` používá `rolePermissions('manager')`.
  - při prázdném `permissions` z API se používá role-based fallback.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- WARNING (env blocker): `pnpm ci:view-states` nelze lokálně plně ověřit v tomto prostředí bez Playwright browser binary; CI workflow browser instaluje.

## E) Rizika / known limits

- Fallback permissions jsou read-only baseline; write oprávnění zůstává řízené serverovým payloadem.

## F) Handoff pro další prompt

- Pokud se změní RBAC role matice, aktualizovat i `ROLE_READ_PERMISSIONS` fallback mapu.
