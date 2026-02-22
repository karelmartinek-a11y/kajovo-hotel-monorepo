# ORF-09 SQLite test DB path fix Verification

## A) Cíl

Opravit CI fail `sqlite3.OperationalError: unable to open database file` stabilizací cesty a adresáře pro test SQLite DB v API testech.

## B) Exit criteria

- API test DB používá deterministickou, zapisovatelnou cestu s garantovanou existencí adresáře.
- CI workflow vytváří adresář pro SQLite DB před `pytest` během API jobu.
- `pnpm unit`, `pnpm lint`, `pnpm typecheck` prochází.

## C) Změny

- Přidán fixture `api_db_path` v `apps/kajovo-hotel-api/tests/conftest.py` s adresářem `/.tmp/api-tests` (`mkdir -p`) a cleanup po testech.
- `api_base_url` fixture používá `api_db_path` pro `KAJOVO_API_DATABASE_URL`.
- Audit-assert testy (`test_health.py`, `test_rbac.py`, `test_users.py`) čtou DB přes stejný fixture path namísto hardcoded relativní/absolutní cesty.
- Do `.github/workflows/ci-full.yml` přidán krok `Ensure SQLite database directory exists` před API pytest během `api-tests` jobu.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `ruff check apps/kajovo-hotel-api`
- PASS: `pnpm unit`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`

## E) Rizika / known limits

- Řešení je navázané na workspace root cestu `/.tmp/api-tests`; při změně job cwd je potřeba zachovat ekvivalentní vytvoření adresáře.

## F) Handoff pro další prompt

- Nové API testy přistupující přímo k SQLite souboru mají používat fixture `api_db_path`.
- Zachovat CI krok pro vytvoření DB adresáře i při refaktoru workflow.
