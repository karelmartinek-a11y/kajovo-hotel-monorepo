# Prompt 06 follow-up 3 – verification section header fix

## A) Cíl
- Opravit CI/PR chybu validace verifikačního dokumentu, která hlásila chybějící sekci `E) Rizika/known limits` v `docs/regen/06-api-foundation/verification.md`.

## B) Exit criteria
- `docs/regen/06-api-foundation/verification.md` obsahuje přesně sekci `## E) Rizika/known limits`.
- Fix je omezený na dokumentační/CI evidence vrstvu (fix-only).
- Parity mapa obsahuje záznam tohoto opravného kroku.

## C) Změny
- Upraven název sekce v `docs/regen/06-api-foundation/verification.md` z `## E) Rizika / known limits` na `## E) Rizika/known limits`.
- Aktualizována parity mapa o fix-only evidence záznam.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm ci:verification-doc`
  - Výstup: gate je PR-only, mimo PR kontext korektně skipuje.
- PASS: `ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- PASS: `python -m pytest apps/kajovo-hotel-api/tests`
- FAIL (environment): `pnpm install`
  - Důvod: npm registry vrací 403 pro `@playwright/test`, bez autorizace nelze připravit frontend dependencies a tím ani plně ověřit `pnpm typecheck`.

## E) Rizika/known limits
- `ci:verification-doc` mimo PR kontext neprovádí plnou kontrolu obsahu a pouze skipuje gate.
- Frontend typecheck zůstává blokovaný externím registry přístupem v tomto runneru.

## F) Handoff pro další prompt
- Ověřit v PR pipeline, že kontrola verifikačních sekcí už nehlásí chybějící `E) Rizika/known limits`.
- Po vyřešení npm registry přístupu doplnit `pnpm typecheck` do plného quality gate běhu.
