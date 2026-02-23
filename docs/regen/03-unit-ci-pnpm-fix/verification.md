# 03 Unit CI pnpm fix – verification

## A) Cíl
Opravit CI pád v jobu `unit-tests`, kde krok používal `pnpm test:unit` bez inicializace `pnpm`, což způsobilo chybu `pnpm: command not found`.

## B) Exit criteria
- `unit-tests` job nebude závislý na `pnpm` binárce.
- Unit test krok poběží přímo přes Python (`pytest`) po instalaci API dev závislostí.
- Dokumentace kroku bude uložená v `docs/regen/03-unit-ci-pnpm-fix/verification.md`.
- `docs/regen/parity/parity-map.yaml` bude obsahovat konkrétní referenci na tento krok.

## C) Změny
- `.github/workflows/ci-gates.yml`
  - v jobu `unit-tests` změněn krok `Unit tests` z `pnpm test:unit` na:
    - `cd apps/kajovo-hotel-api`
    - `python -m pytest`
- `docs/regen/parity/parity-map.yaml`
  - doplněn modul `unit_tests_ci_runtime_bootstrap` se stavem `DONE` a referencí na tento krok.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- FAIL (environment blocker): `pnpm test:unit`
  - lokální prostředí používá Python 3.10 (`enum.StrEnum` není dostupné), zatímco CI workflow explicitně používá Python 3.11.
- PASS (static check): `rg -n "Unit tests|python -m pytest|pnpm test:unit" .github/workflows/ci-gates.yml`

## E) Rizika/known limits
- Lokální validace API unit testů je limitována verzí Pythonu v prostředí.
- CI očekává Python 3.11; pokud by byl runner změněn na starší verzi, testy spadnou na kompatibilitě API kódu.

## F) Handoff pro další prompt
- Volitelně přidat explicitní assert kroku runneru (např. `python --version`) před pytest pro rychlou diagnostiku CI prostředí.
