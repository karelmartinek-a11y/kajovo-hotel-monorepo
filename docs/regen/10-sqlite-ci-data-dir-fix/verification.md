# ORF-10 SQLite CI data dir alignment Verification

## A) Cíl

Sjednotit SQLite test DB umístění na `apps/kajovo-hotel-api/data` a odstranit zbývající CI neshodu cesty/adresáře.

## B) Exit criteria

- API test fixture ukládá test DB do `apps/kajovo-hotel-api/data/test_kajovo_hotel.db`.
- `ci-full` workflow vytváří `apps/kajovo-hotel-api/data` před API pytest jobem.
- `pnpm unit`, `pnpm lint`, `pnpm typecheck` prochází.

## C) Změny

- Aktualizován `api_db_path` fixture v `apps/kajovo-hotel-api/tests/conftest.py` na adresář `apps/kajovo-hotel-api/data`.
- Upraven workflow krok `Ensure SQLite database directory exists` v `.github/workflows/ci-full.yml` na `mkdir -p apps/kajovo-hotel-api/data`.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `ruff check apps/kajovo-hotel-api`
- PASS: `pnpm unit`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`

## E) Rizika / known limits

- File-based SQLite zůstává citlivé na cwd/path změny; proto je path explicitně absolutní z workspace root.

## F) Handoff pro další prompt

- Při dalších úpravách test bootstrapu zachovat jediný source-of-truth path v `api_db_path` fixture.
