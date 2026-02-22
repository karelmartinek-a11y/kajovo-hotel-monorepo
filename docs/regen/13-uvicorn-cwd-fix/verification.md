# ORF-13 Uvicorn cwd fix Verification

## A) Cíl

Opravit `FileNotFoundError: ... 'apps/kajovo-hotel-api'` v API test fixture při spuštění uvicorn subprocessu.

## B) Exit criteria

- `subprocess.Popen(..., cwd=...)` v test fixture používá stabilní absolutní path odvozenou od umístění souboru.
- `pnpm unit`, `pnpm lint`, `pnpm typecheck` prochází.

## C) Změny

- `apps/kajovo-hotel-api/tests/conftest.py`: přidán výpočet `api_app_dir = Path(__file__).resolve().parents[1]`.
- `subprocess.Popen` pro uvicorn používá `cwd=str(api_app_dir)` místo relativního `apps/kajovo-hotel-api`.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `ruff check apps/kajovo-hotel-api`
- PASS: `pnpm unit`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`

## E) Rizika / known limits

- Fixture stále předpokládá standardní layout repo (`tests/` přímo pod `apps/kajovo-hotel-api`).

## F) Handoff pro další prompt

- U subprocess cwd v testech používat absolutní path z `Path(__file__)`, ne relativní cwd-dependent stringy.
