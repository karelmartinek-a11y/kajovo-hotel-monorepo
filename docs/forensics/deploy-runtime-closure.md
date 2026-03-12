# Deploy and Breakfast Runtime Closure

Date: 2026-03-12
Scope: breakfast runtime reality, IMAP/scheduler proof, deploy hardening, release gate hardening, parity evidence cleanup.

## What was found

- Breakfast CRUD/import/export already existed, but runtime proof was uneven: save/import was tested, yet preview immutability, export RBAC, diet toggle restrictions, and admin-only reactivation were not all covered by explicit tests.
- IMAP fetcher and scheduler existed, but they lacked a deterministic archival runtime proof beyond a single unit-style smoke test. Missing-configuration handling and parse/connect failure logging were also too soft for operational forensics.
- The production deploy script verified container startup only indirectly. It did not block on container health for every service, did not perform local post-compose health checks, and did not emit a server-side deploy artifact binding runtime state to the deployed SHA.
- The deploy workflow validated public HTTP and live admin login, but it did not fetch a server-side runtime artifact proving that the host itself finished the deploy for the same SHA.
- `docs/feature-parity-matrix.csv` still used optimistic language equivalent to “done” even where runtime proof was only partial or absent.

## Exact fixes

### Breakfast
- Expanded breakfast API test coverage to include:
  - PDF preview without mutation of existing saved orders,
  - export RBAC denial for `snídaně`,
  - diet-toggle RBAC denial for `snídaně`,
  - admin-only `reactivate-all` enforcement.
- Normalized the breakfast role check in the route to canonical `snídaně`.

Code evidence:
- `apps/kajovo-hotel-api/app/api/routes/breakfast.py`
- `apps/kajovo-hotel-api/tests/test_breakfast.py`

### IMAP and scheduler
- Added fetcher configuration validation so missing IMAP configuration is logged as an explicit operational skip instead of a silent no-op.
- Added guarded handling for IMAP connection/login failures, mailbox/search/fetch failure logging, and invalid PDF attachments.
- Introduced `BreakfastSchedulerResult` plus runtime artifact writing (`breakfast-scheduler-latest.json`) for every scheduler iteration.
- Introduced deterministic runtime smoke script `scripts/run_breakfast_runtime_smoke.py` that proves end-to-end scheduler/import/archive behavior and leaves an archival JSON artifact during the run.

Code evidence:
- `apps/kajovo-hotel-api/app/services/breakfast/mail_fetcher.py`
- `apps/kajovo-hotel-api/app/services/breakfast/scheduler.py`
- `apps/kajovo-hotel-api/tests/test_breakfast_imap_smoke.py`
- `scripts/run_breakfast_runtime_smoke.py`
- `apps/kajovo-hotel-api/app/config.py`

### Deploy and release gate
- Strengthened `infra/ops/deploy-production.sh` to:
  - require critical host commands up front,
  - wait for `postgres`, `api`, `web`, and `admin` container health,
  - block on direct local health checks (`/ready`, `/api/health`, `/healthz`),
  - emit `artifacts/deploy-runtime/latest.json` on the server with branch/SHA/check results.
- Strengthened GitHub deploy workflow to:
  - fetch the server-side runtime artifact after deploy,
  - verify the artifact SHA matches the exact deployed SHA,
  - upload the runtime artifact to GitHub Actions as an archival evidence object.
- Strengthened unified release gate to require:
  - typecheck,
  - web build,
  - admin build,
  - backend unit tests,
  - breakfast IMAP smoke,
  - deterministic breakfast runtime smoke,
  - optional frontend/e2e gates when enabled.

Code evidence:
- `infra/ops/deploy-production.sh`
- `.github/workflows/deploy-production.yml`
- `scripts/release_gate.py`
- `infra/smoke/smoke.sh`
- `infra/verify/verify-deploy.sh`

### Documentation and parity evidence
- Rewrote `docs/feature-parity-matrix.csv` into a more forensic shape with separate fields for:
  - `API hotovo`
  - `UI hotovo`
  - `Test hotovo`
  - `Runtime prokazano`
  - `Manifest pass`
- Downgraded optimistic runtime claims where the repository currently has only code/test evidence and not live runtime proof.

Code evidence:
- `docs/feature-parity-matrix.csv`

## How this was tested

Local verification target set for this stage:
- `python -m pytest apps/kajovo-hotel-api/tests/test_breakfast.py apps/kajovo-hotel-api/tests/test_breakfast_imap_smoke.py -q`
- `python scripts/run_breakfast_runtime_smoke.py`
- `python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- `python scripts/release_gate.py` (targeted release artifact proof)

Remote/runtime evidence expected after push of the same SHA:
- `CI Gates - KajovoHotel` green,
- `Deploy - hotel.hcasc.cz` green,
- uploaded GitHub artifact `deploy-runtime-artifact`,
- server-side `artifacts/deploy-runtime/latest.json` SHA matching the workflow SHA.

## Residual honesty

- Breakfast scheduler runtime proof is now deterministic and archival, but it is still a controlled smoke harness, not proof against a real production mailbox.
- Rollback scripts exist and are referenced, but this stage does not freshly rehearse a destructive rollback on production.
- Some parity rows remain `PARTIAL` or `NO` for runtime proof on purpose, because the repository should no longer claim live evidence it does not actually archive.
