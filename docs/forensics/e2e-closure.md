# E2E Closure

Date: 2026-03-12

## Scope completed
- `apps/kajovo-hotel-web/tests/portal-journeys.spec.ts`
  - login, forgot password, role selection
  - breakfast import preview/save, export PDF, diet toggles, reactivation
  - lost-found, issues, inventory and reports workflows
  - utility states and responsive portal navigation
- `apps/kajovo-hotel-admin/tests/admin-journeys.spec.ts`
  - users CRUD, active toggle, reset link, delete dialog
  - SMTP settings save and test mail
  - admin profile and password flow
  - utility states and deep-link verification
- `apps/kajovo-hotel-web/tests/rbac-access.spec.ts`
  - extra deep-link denial coverage for recepce
- `apps/kajovo-hotel-admin/tests/rbac-access.spec.ts`
  - extra deep-link coverage for sklad view
- `scripts/run-playwright-with-api.js`
  - unique temp DB and media root per run

## Original problem
- The repo had only smoke/gate level coverage for many frontend flows.
- Long admin and portal journeys were missing.
- Parallel Playwright runs could collide on one shared SQLite temp DB.

## Exact fix
- Added new portal and admin journey specs focused on real UI workflows.
- Extended RBAC deep-link coverage.
- Isolated the backend harness per run so concurrent Playwright sessions do not corrupt each other.

## Evidence in code
- `C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/tests/portal-journeys.spec.ts`
- `C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/tests/fixtures/breakfast-import.pdf`
- `C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/tests/admin-journeys.spec.ts`
- `C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/tests/rbac-access.spec.ts`
- `C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/tests/rbac-access.spec.ts`
- `C:/GitHub/kajovo-hotel-monorepo/scripts/run-playwright-with-api.js`

## Verification
- PASS
  - `node scripts/run-playwright-with-api.js --app apps/kajovo-hotel-web tests/portal-journeys.spec.ts tests/rbac-access.spec.ts --project=desktop`
  - `node scripts/run-playwright-with-api.js --app apps/kajovo-hotel-admin tests/admin-journeys.spec.ts tests/rbac-access.spec.ts --project=desktop`
  - `pnpm --filter @kajovo/kajovo-hotel-web lint`
  - `pnpm --filter @kajovo/kajovo-hotel-admin lint`
- FAIL, still open
  - `pnpm --filter @kajovo/kajovo-hotel-web test`
  - `pnpm --filter @kajovo/kajovo-hotel-admin test`

## Remaining open findings
- The default web package suite still fails in older `ci-gates` and `nav-robustness` coverage outside the new journey specs.
- The default admin package suite still fails in several legacy phone/tablet scenarios and one older state-route gate.
- This stage materially improved E2E coverage and removed harness collisions, but it is not yet a truthful claim of full package-level E2E PASS.
