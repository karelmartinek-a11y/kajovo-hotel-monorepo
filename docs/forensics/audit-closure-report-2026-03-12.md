# Audit Closure Report (2026-03-12)

Scope base SHA: `44e4cde30b3f720ec0a46b15abc3b44ed1af061b`

## F-01 Brand composition
- Change: removed figurative brand layer from shared shell and login views; normalized to max 2 brand elements per non-popup view.
- Files: `packages/ui/src/shell/AppShell.tsx`, `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-web/src/admin/AdminLoginPage.tsx`, `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`, admin Playwright specs.
- Done proof: Playwright gates count `[data-brand-element="true"]` and enforce `<=2` for key/login/utility routes.
- Test coverage: `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts`, `apps/kajovo-hotel-admin/tests/signage-routes.spec.ts`.

## F-02 Hardcoded date
- Change: replaced fixed defaults and UTC slicing with timezone-safe runtime day utility.
- Files: `apps/kajovo-hotel-admin/src/lib/date.ts`, `apps/kajovo-hotel-web/src/lib/date.ts`, both `main.tsx` files.
- Done proof: no hardcoded `2026-02-19` remains in UI logic; default date assertions in CI gate.
- Test coverage: `apps/kajovo-hotel-admin/tests/ci-gates.spec.ts` date-default test.

## F-03 Device provisioning
- Change: implemented full device handshake domain (`register/status/challenge/verify`) with hashed device secret + issued bearer token.
- Files: `apps/kajovo-hotel-api/app/api/routes/device.py`, `app/main.py`, `app/api/schemas.py`, `app/db/models.py`, `app/security/auth.py`, migration `0018_*`.
- Done proof: API endpoints are live and tested.
- Test coverage: `apps/kajovo-hotel-api/tests/test_device_provisioning.py`.

## F-04 Reports media parity
- Change: added report photo upload/list/thumb/original pipeline.
- Files: `apps/kajovo-hotel-api/app/api/routes/reports.py`, `app/db/models.py`, `app/api/schemas.py`, migration `0019_*`.
- Done proof: reports now have parity media handlers equivalent to issues/lost_found.
- Test coverage: `apps/kajovo-hotel-api/tests/test_reports.py` (`test_report_photo_pipeline`).

## F-05 Inventory semantic parity
- Change: documented and closed ingredient/card semantic mapping to current item/movement/audit model.
- Files: `docs/forensics/inventory-legacy-parity-map-2026-03-12.md`, `docs/feature-parity-matrix.csv`.
- Done proof: parity row changed to FULLY_WORKING with explicit mapping evidence.
- Test coverage: inventory API tests already present in `apps/kajovo-hotel-api/tests/test_inventory.py`.

## F-06 Admin profile/password
- Change: implemented admin profile API + secure password-change flow and admin UI profile route.
- Files: `apps/kajovo-hotel-api/app/api/routes/profile.py`, `app/api/routes/auth.py`, `app/api/schemas.py`, `app/db/models.py`, migration `0019_*`, `apps/kajovo-hotel-admin/src/main.tsx`.
- Done proof: profile read/update/password routes active and UI route `/profil` integrated.
- Test coverage: `apps/kajovo-hotel-api/tests/test_admin_profile.py`.

## F-07 Breakfast IMAP operational proof
- Change: added deterministic IMAP smoke scenario to validate fetcher + import persistence + archive artifact behavior.
- Files: `apps/kajovo-hotel-api/tests/test_breakfast_imap_smoke.py`.
- Done proof: smoke test passes and is wired into release gate script.
- Test coverage: `pytest apps/kajovo-hotel-api/tests/test_breakfast_imap_smoke.py`.

## F-08 Unified release gate
- Change: created single orchestrated release gate runner that writes archive artifact with SHA/date/checks.
- Files: `scripts/release_gate.py`, `.github/workflows/ci-gates.yml`.
- Done proof: gate emits `artifacts/release-gate/release-gate-*.json` with binary PASS/FAIL.
- Test coverage: workflow executes release gate script; script executes typecheck + API tests + IMAP smoke (+ optional frontend/e2e gates).

## F-09 SSOT and doc drift
- Change: created authoritative SSOT and marked older forensic summaries as historical.
- Files: `docs/SSOT_SCOPE_STATUS.md`, `docs/forensic-audit*.md`, `docs/parity-verdict.md`.
- Done proof: single active SSOT with date + SHA and governance rule for future status claims.
