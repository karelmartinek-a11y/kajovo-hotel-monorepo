# Deploy summary (2026-02-28)

## Baseline (audit environment)

- **Environment:** `/tmp/kajovo-env` (copy of `infra/.env.example`).
- **Builds:** `pnpm --filter @kajovo/kajovo-hotel-web build` and `pnpm --filter @kajovo/kajovo-hotel-admin build` succeeded.
- **Known limitations:** v auditním prostředí nebyl dostupný Docker daemon ani Playwright browser binárky.

## Current validation update (2026-02-28)

- **Source commit:** `158e9e4`.
- **API critical-path tests (P0/P1):** zelené:
  - `tests/test_auth_role_selection.py`
  - `tests/test_rbac.py`
  - `tests/test_users.py`
  - `tests/test_reports.py`
  - `tests/test_smtp_email_service.py`
  - `tests/test_auth_lockout.py`
- **`pnpm ci:gates`:** aktuálně FAIL v tomto prostředí kvůli chybějícím Playwright browser binárkám (`pnpm exec playwright install --with-deps` required).

## Next steps

1. Spustit `pnpm exec playwright install --with-deps` na CI runneru/hostu a znovu ověřit `pnpm ci:gates`.
2. Spustit `infra/verify/verify-deploy.sh` na hostu s dostupným Docker daemonem a externí sítí `deploy_hotelapp_net`.
3. Do release evidence přidat finální deploy commit SHA + timestamp z produkčního hostu.
