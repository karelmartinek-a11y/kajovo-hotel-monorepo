# ORF-06 Prompt 08 – RBAC hardening verification

## A) Cíl
- Zajistit server-side RBAC hardening na admin API endpointů včetně actor-type guardu pro endpointy správy uživatelů.
- Potvrdit UI access handling (skrytí neautorizované navigace + AccessDenied při direct-route vstupu).
- Dodat testovací evidenci: API deny matrix + minimálně 1 e2e unauthorized direct-route test.

## B) Exit criteria
- Bez oprávnění nelze provést admin read/write akce.
- Admin-only endpointy (`/api/v1/users*`) nelze volat z portal session, i když role má `users:*` oprávnění.
- V UI je neautorizovaný modul skrytý v navigaci a direct entry vede na AccessDenied.
- Krok má aktualizovanou parity evidenci.

## C) Změny
- Přidán actor-type guard `require_actor_type(...)` do API RBAC vrstvy.
- User-management router (`/api/v1/users`) nyní vyžaduje zároveň `actor_type=admin` i modulové oprávnění `users:read/write`.
- Rozšířen test setup o `manager` test účet pro deny matrix.
- Přidán API deny matrix test pokrývající zamítnutí read/write akcí pro nedostatečné role a actor-type mismatch.
- E2E unauthorized direct-route test v admin app byl upraven na `actor_type='admin'`, aby validoval skutečný admin entrypoint scénář se sníženou rolí.
- Fix-only CI korekce: `apps/kajovo-hotel-api/tests/test_rbac_admin_matrix.py` byl upraven na Ruff-compliant import ordering a line-length <= 100.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `python -m pytest apps/kajovo-hotel-api/tests/test_rbac_admin_matrix.py apps/kajovo-hotel-api/tests/test_rbac.py`
- PASS: `python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- FAIL (environment): `cd apps/kajovo-hotel-admin && pnpm exec playwright install chromium` (Playwright CDN vrací 403 Forbidden)
- FAIL (environment): `pnpm --filter @kajovo/kajovo-hotel-admin test -- --project=desktop tests/rbac-access.spec.ts` (není dostupný Playwright Chromium binary v prostředí)

## E) Rizika/known limits
- E2E verifikace unauthorized direct-route v tomto běhu nebyla dokončena kvůli environment download blockeru Playwright browseru (403 z CDN). Lokální/CI běh s dostupným browser artefaktem by měl test validně spustit.
- RBAC enforcement je závislý na konzistenci session `actor_type` a role claimů v auth cookie.

## F) Handoff pro další prompt
- Jakmile bude dostupný Playwright browser binary v CI/runtime, zopakovat pouze:
  1. `pnpm --filter @kajovo/kajovo-hotel-admin test -- --project=desktop tests/rbac-access.spec.ts`
- Pokud se bude rozšiřovat IAM model, zachovat pattern: `actor_type` guard + modulové permission guardy u citlivých endpointů.
