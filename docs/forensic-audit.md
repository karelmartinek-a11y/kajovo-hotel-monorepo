# Forensic audit: legacy vs monorepo parity

## Scope and method

This audit compared legacy source-of-truth implementations in:
- `legacy/hotel-backend`
- `legacy/hotel-frontend`

Against the current monorepo implementation in:
- `apps/kajovo-hotel-api`
- `apps/kajovo-hotel-web`
- `packages/ui`, `packages/shared`
- `infra`

Method used:
1. Enumerate routes/endpoints and module capabilities from code evidence.
2. Enumerate DB model/migration/auth/infra footprints.
3. Cross-map capabilities into parity matrix states (`FULLY_WORKING`, `PARTIAL`, `SKELETON`, `MISSING`, `UNKNOWN`).
4. Run available automated checks without modifying code.

## Legacy footprint summary

Legacy is a mixed server-rendered + API system with:
- full admin web surface (reports, breakfast, inventory, users, settings, profile),
- portal auth flows (login/forgot/reset),
- device registration/challenge/verification API,
- media and thumbnail serving,
- breakfast PDF ingest and scheduler,
- inventory ingredient/card workflows with pictogram/media handling,
- strong coupling between templates and backend routes.

(See `docs/legacy-inventory.md` for detailed inventory and evidence pointers.)

## New-system footprint summary

New monorepo provides:
- modular REST API for reports, breakfast, lost&found, issues, inventory,
- React SPA with IA-driven routes and full CRUD screens for those modules,
- shared UI/component and generated API client packages,
- infra cutover/rollback, compose environments, smoke/verify scripts,
- API unit/integration tests for all current modules.

Major absences vs legacy:
- no admin/portal authentication flows (cookie/session/login/reset),
- no device provisioning API,
- no SMTP/settings/users/profile modules,
- no legacy media auth/thumb serving path,
- no breakfast mail/PDF scheduler equivalent.

(See `docs/new-system-inventory.md` and `docs/feature-parity-matrix.csv`.)

## Route/page mapping findings

### Legacy routes that are functionally mapped in new IA

- Reports (`/admin/reports*`) -> `/hlaseni*` (list/detail/create/edit)
- Breakfast (`/admin/breakfast*`) -> `/snidane*` (list/detail/create/edit)
- Inventory (`/admin/inventory*`) -> `/sklad*` (list/detail/create/edit)
- Findings (`/admin/reports/findings`) -> `/ztraty-a-nalezy*`
- Issues (`/admin/reports/issues`) -> `/zavady*`

### Legacy routes/pages that remain unmapped

- `/admin/users*` (users management)
- `/admin/settings*` (SMTP/settings)
- `/admin/profile*` (password/profile)
- `/login*`, `/portal` (portal auth/home)
- `/device/*` provisioning/verification API
- `/reports/photos/{photo_id}/thumb` and `/api/internal/media-auth`
- breakfast-specific import/test endpoints (`/admin/breakfast/upload`, `/admin/breakfast/test`) as equivalent workflows.

## Functional verification (run-only)

### API tests
- Command: `pytest -q` in `apps/kajovo-hotel-api`
- Result: **PASS** (`18 passed in 4.03s`)

### Web E2E (Playwright)
- Command: `pnpm test --max-failures=1` in `apps/kajovo-hotel-web`
- Result: **FAIL due environment/tooling precondition** (missing Playwright browser executable `chromium_headless_shell`); test run interrupted.

### Infra smoke
- Command: `bash infra/smoke/smoke.sh`
- Result: **FAIL due environment/runtime precondition** (`curl: (7) Failed to connect to localhost:8080`) because target services were not running.

## Risk profile

Top parity risk clusters:
1. Authentication/regulatory surface not parity-complete (admin/portal/device).
2. Operational workflows around media and SMTP settings absent.
3. Breakfast ingestion automation missing (PDF/email scheduler).
4. Inventory data model divergence (ingredient/card vs single item model).
5. E2E verification pipeline not immediately executable in this environment.

## Decision signal

The codebase has a sound modular API/web foundation for core operational modules, but parity with legacy admin/identity/automation features is incomplete. See `docs/parity-verdict.md` for continue vs regenerate recommendation and remediation ordering.
