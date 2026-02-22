# Prompt 06 follow-up 2 – API health alias schema fix

## A) Cíl
- Opravit chybu z CI, kde přidaný alias `/api/health` generoval nežádoucí metodu `healthApiHealthGet` v `packages/shared/src/generated/client.ts` a rozbíjel očekávaný output pipeline.

## B) Exit criteria
- Alias `/api/health` je zachován funkčně, ale není publikován v OpenAPI schématu.
- Generovaný klient již neobsahuje `healthApiHealthGet`.
- `pnpm contract:generate` produkuje stabilní artefakty odpovídající očekávanému stavu repozitáře.
- API lint + unit testy procházejí.
- Environment blocker pro frontend dependency install je explicitně zdokumentovaný.

## C) Změny
- `apps/kajovo-hotel-api/app/api/routes/health.py`
  - alias route `GET /api/health` změněna na `include_in_schema=False`.
- Regenerované artefakty:
  - `apps/kajovo-hotel-api/openapi.json` (odstraněn `/api/health` z public OpenAPI)
  - `packages/shared/src/generated/client.ts` (odstraněna metoda `healthApiHealthGet`)
- Aktualizovaná parity evidence pro tento fix-only krok.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm contract:generate`
- PASS: `pnpm contract:check`
- PASS: `ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- PASS: `python -m pytest apps/kajovo-hotel-api/tests`
- FAIL (environment): `pnpm install`
  - Důvod: npm registry vrací 403 pro `@playwright/test` (chybí autorizace), nelze připravit frontend dependencies pro `pnpm typecheck`.

## E) Rizika/known limits
- Alias `/api/health` je záměrně mimo veřejný OpenAPI kontrakt; externí SDK klient se generuje jen z primární API surface.
- Frontend typecheck zůstává v tomto runneru blokovaný registry access policy.

## F) Handoff pro další prompt
- Po obnovení přístupu do npm registru spustit `pnpm install && pnpm typecheck` pro plné uzavření quality gates.
- Pokud bude potřeba `/api/health` v klientovi, řešit to cílenou ruční helper funkcí mimo autogenerovaný kontrakt.
