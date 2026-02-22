# ORF-11 Workspace path portability fix Verification

## A) Cíl

Odstranit hardcoded absolutní cestu `/workspace/kajovo-hotel-monorepo` z API test fixture, aby CI nepadalo na `FileNotFoundError`/`PermissionError` mimo lokální kontejnery.

## B) Exit criteria

- `api_db_path` nepoužívá hardcoded `/workspace/...`.
- Fixture používá `GITHUB_WORKSPACE` (pokud existuje) a fallback na repo-root z `__file__`.
- Quality gates `ruff check apps/kajovo-hotel-api`, `pnpm unit`, `pnpm lint`, `pnpm typecheck` prochází.

## C) Změny

- V `apps/kajovo-hotel-api/tests/conftest.py` upraven výpočet `api_db_path`:
  - primárně `Path(os.getenv("GITHUB_WORKSPACE", ...))`
  - fallback na repo root odvozený z `Path(__file__).resolve().parents[3]`
  - data dir zůstává `apps/kajovo-hotel-api/data`.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `ruff check apps/kajovo-hotel-api`
- PASS: `pnpm unit`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`

## E) Rizika / known limits

- Fallback `parents[3]` předpokládá zachovanou cestu souboru `apps/kajovo-hotel-api/tests/conftest.py` v repo stromu.

## F) Handoff pro další prompt

- Nové test fixture cesty řešit přes env-aware root (`GITHUB_WORKSPACE`) a vyhnout se absolutním host-specifickým path.
