# Prompt 06 follow-up – API foundation contract sync fix

## A) Cíl
- Opravit CI chybu po doplnění `/api/health` tím, že se synchronizuje export OpenAPI a generovaný TypeScript klient.

## B) Exit criteria
- `apps/kajovo-hotel-api/openapi.json` obsahuje `/api/health` endpoint.
- `packages/shared/src/generated/client.ts` obsahuje odpovídající klientskou metodu.
- `pnpm contract:check` prochází bez diffu.
- lint + unit pro API procházejí, typecheck je buď zelený, nebo explicitně zdokumentovaný environment blocker.

## C) Změny
- Regenerován OpenAPI kontrakt (`apps/kajovo-hotel-api/openapi.json`) po změnách health endpointů.
- Regenerován sdílený klient (`packages/shared/src/generated/client.ts`) o metodu pro `GET /api/health`.
- Aktualizována parity mapa o fix-only evidence krok.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm contract:generate`
- PASS: `pnpm contract:check`
- PASS: `ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- PASS: `python -m pytest apps/kajovo-hotel-api/tests`
- FAIL (environment): `pnpm install`
  - Důvod: registr npm vrací 403 pro `@playwright/test` (chybí autorizace), proto není možné připravit frontend dependencies pro `pnpm typecheck`.

## E) Rizika/known limits
- Bez přístupu k registru npm (403) nelze v tomto runneru validovat frontend `typecheck`.
- Fix je úmyslně omezený na contract sync (OpenAPI + generated client), bez dalších doménových zásahů.

## F) Handoff pro další prompt
- Pokud runner získá přístup k npm registru, spustit `pnpm install` a následně `pnpm typecheck` jako plné uzavření quality gates.
- Při každé změně API route spouštět `pnpm contract:generate` a commitnout i generated artefakty ve stejném PR.
