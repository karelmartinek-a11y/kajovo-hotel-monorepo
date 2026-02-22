# 03 – Monorepo app map (admin/portal split)

## Scope
- `apps/kajovo-hotel-web` = **KájovoHotel Portal** (portal actor only).
- `apps/kajovo-hotel-admin` = **KájovoHotel Admin** (admin actor only).
- `apps/kajovo-hotel-api` = shared API backend for both entrypointů.

## Login entrypoints
- Portal login: `apps/kajovo-hotel-web/src/main.tsx` route `/login` (calls `/api/auth/login`).
- Admin login: `apps/kajovo-hotel-admin/src/main.tsx` route `/login` (calls `/api/auth/admin/login`).

## Runtime contract
- Portal app po načtení identity vyžaduje `actorType === 'portal'`; jinak redirect na `/login`.
- Admin app po načtení identity vyžaduje `actorType === 'admin'`; jinak redirect na `/login`.
- API drží separátní auth endpointy:
  - `/api/auth/login` (portal)
  - `/api/auth/admin/login` (admin)

## Guardrail
- Policy sentinel (`apps/kajovo-hotel/ci/policy-sentinel.mjs`) nově kontroluje i cross-app importy `apps/kajovo-hotel-web/src/**` <-> `apps/kajovo-hotel-admin/src/**` pro `pages/views` cesty.
