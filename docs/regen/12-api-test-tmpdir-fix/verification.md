# ORF-12 API test tmpdir hardening Verification

## A) Cíl

Odstranit závislost API test DB na workspace filesystému (a tím i rizika `FileNotFoundError`/`PermissionError`), bez nutnosti externího job log lookup.

## B) Exit criteria

- `api_db_path` používá garantovaně zapisovatelný pytest temp dir.
- API testy nepoužívají hardcoded `/workspace/...` path.
- `pnpm unit`, `pnpm lint`, `pnpm typecheck` prochází.

## C) Změny

- `apps/kajovo-hotel-api/tests/conftest.py`: `api_db_path` fixture změněn na `tmp_path_factory.mktemp("kajovo-api-data")` + cleanup.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `ruff check apps/kajovo-hotel-api`
- PASS: `pnpm unit`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`

## E) Rizika / known limits

- Temp DB je ephemeral; testy nesmí spoléhat na perzistenci mezi běhy.

## F) Handoff pro další prompt

- Zachovat pattern: integrační test DB přes `tmp_path_factory`, ne přes host-specifické absolutní cesty.
