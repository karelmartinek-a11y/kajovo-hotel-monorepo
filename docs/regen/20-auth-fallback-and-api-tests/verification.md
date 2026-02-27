# Verification

## A) Cíl
Zajistit, že auth fallback objekty odpovídají `AuthProfile`, UI bootstrap je odolný při výpadku `/api/auth/me`, a testy (web + API) odpovídají aktuálním požadavkům (RBAC copy, CSRF, schema pro vytvoření uživatele).

## B) Exit criteria
- Admin + Web TypeScript lint projde.
- API testy pro RBAC a SMTP onboarding projdou.
- Playwright asserty nejsou křehké na drobné textové změny.
- Verifikační dokument splňuje gate sekce A–F.
- Kontraktové artefakty (`openapi.json`, generovaný TS klient) jsou po `contract:generate` čisté v git diffu.

## C) Změny
- Doplněny chybějící `roles` a `activeRole` do fallback `AuthProfile` objektů (admin + web).
- Upravena web RBAC Playwright assertion na robustnější regex podle aktuálního textu Access Denied.
- API RBAC testy aktualizovány na seedované uživatele a CSRF hlavičky pro chráněné endpointy.
- SMTP test aktualizován pro aktuální `PortalUserCreate` schema (`first_name`, `last_name`, `roles`) a aktuální subject hint mailu.
- V CI `web-tests` workflow přidán background start API na `127.0.0.1:8000` + readiness wait, aby Vite proxy měla dostupný backend.
- V e2e smoke configu změněna readiness URL preview serverů na `/login` místo `/`.
- E2E smoke auth test upraven na semantické lokátory (`getByLabel`) + explicitní URL check `/login`.
- Regenerovány kontraktové soubory (`apps/kajovo-hotel-api/openapi.json`, `packages/shared/src/generated/client.ts`).

## D) Ověření
- `pnpm contract:generate`
- `git diff --exit-code -- apps/kajovo-hotel-api/openapi.json packages/shared/src/generated/client.ts`
- `pnpm --filter @kajovo/kajovo-hotel-admin lint`
- `pnpm --filter @kajovo/kajovo-hotel-web lint`
- `pnpm ci:verification-doc`

## E) Rizika/known limits
- Fallback auth profil může maskovat backend problémy; nutné sledovat logy/observabilitu.
- Web-tests workflow nově spouští API bez explicitního teardown kroku; proces je ukončen runnerem po jobu.
- Regex assertion v RBAC testu je robustnější, ale stále závislá na základní uživatelské hlášce.

## F) Handoff pro další prompt
- Pokud se změní `AuthProfile` kontrakt nebo RBAC copy, aktualizovat fallback objekty a Playwright asserty.
- Při změnách auth/API bootstrapu v CI ověřit, že web-tests stále startují backend a čekají na `/health`.
- Při změně OpenAPI endpointů vždy spustit `pnpm contract:generate` a commitnout výsledné artefakty.
