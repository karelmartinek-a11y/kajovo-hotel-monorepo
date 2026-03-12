# Backend Closure

Date: 2026-03-12
Release runtime SHA under audit: `d51755d9791f851151adeb03e04e04ad40888709`
Scope: auth, RBAC, users, settings, profile, reports, issues, lost-found, inventory, breakfast, device, timezone/audit hygiene, and backend runtime/deploy proof.

## Original problem
- Backend current HEAD still needed forensic closure for UTC consistency, audit detail consistency, release/runtime proof quality, and role/auth robustness.
- Breakfast scheduler/import existed, but runtime proof and failure-path logging were weaker than release-ready governance required.
- Older traces of encoding drift and mojibake-compatible literals still reduced auditability in active backend/auth layers.
- Release/deploy proof was too optimistic until CI, smoke, runtime verification, and deploy evidence were tied to the same SHA.

## Exact repair
- Added shared backend helpers for timezone-aware UTC handling and structured audit payload generation.
- Removed the remaining literal mojibake alias handling from active RBAC logic and replaced it with systematic text-repair normalization.
- Hardened breakfast mail fetcher and scheduler with stronger validation, deterministic smoke proof, and explicit warning/error paths.
- Strengthened admin credential sync, auth/session handling, and runtime observability around the live deploy path.
- Bound release verification to build, backend tests, breakfast runtime smoke, and deploy verification for the same release chain.

## Evidence in code
- Time and audit helpers:
  - `apps/kajovo-hotel-api/app/time_utils.py`
  - `apps/kajovo-hotel-api/app/audit_utils.py`
- Auth and RBAC hardening:
  - `apps/kajovo-hotel-api/app/security/auth.py`
  - `apps/kajovo-hotel-api/app/security/rbac.py`
  - `apps/kajovo-hotel-api/app/services/admin_credentials.py`
- Breakfast/runtime hardening:
  - `apps/kajovo-hotel-api/app/api/routes/breakfast.py`
  - `apps/kajovo-hotel-api/app/services/breakfast/mail_fetcher.py`
  - `apps/kajovo-hotel-api/app/services/breakfast/scheduler.py`
  - `scripts/run_breakfast_runtime_smoke.py`
- Release/deploy integration:
  - `scripts/release_gate.py`
  - `.github/workflows/deploy-production.yml`
  - `infra/ops/deploy-production.sh`
  - `infra/smoke/smoke.sh`
  - `infra/verify/verify-deploy.sh`

## How it was tested
- Local backend verification:
  - `python -m pytest apps/kajovo-hotel-api/tests -q` -> `61 passed`
  - `python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests` -> `PASS`
  - `python scripts/run_breakfast_runtime_smoke.py` -> `PASS`
  - `python scripts/release_gate.py` -> `PASS`
- Remote verification for release SHA `d51755d...`:
  - `CI Gates - KajovoHotel` run `23021479714` -> `success`
  - `CI Release - Kajovo Hotel` run `23021479741` -> `success`
  - `CI Full - Kajovo Hotel` run `23021479701` -> `success`
  - `Deploy - hotel.hcasc.cz` run `23021567638` -> `success`

## Result
- Backend current release candidate is UTC-consistent, RBAC/auth-consistent, and tied to repeatable runtime/deploy evidence.
- Breakfast runtime proof is no longer ?code exists?; it is backed by deterministic smoke and deploy verification.
- No known P0/P1 backend release blocker remains for the audited release runtime SHA.
