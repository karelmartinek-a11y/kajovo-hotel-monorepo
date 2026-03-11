# New-system inventory

This document is a structural inventory of the current monorepo. For the forensic verdict and parity status, use:

- `docs/forensic-audit-2026-03-11-current-state.md`
- `docs/feature-parity-matrix.csv`

## API inventory (`apps/kajovo-hotel-api`)

### Endpoints by module

| Module | Base prefix | Evidence |
|---|---|---|
| Health | `/` | `app/api/routes/health.py` |
| Auth | `/api/auth` | `app/api/routes/auth.py` |
| Breakfast | `/api/v1/breakfast` | `app/api/routes/breakfast.py` |
| Lost & Found | `/api/v1/lost-found` | `app/api/routes/lost_found.py` |
| Issues | `/api/v1/issues` | `app/api/routes/issues.py` |
| Inventory | `/api/v1/inventory` | `app/api/routes/inventory.py` |
| Reports | `/api/v1/reports` | `app/api/routes/reports.py` |
| Users | `/api/v1/users` | `app/api/routes/users.py` |
| Settings | `/api/v1/settings` | `app/api/routes/settings.py` |
| Device | `/device` | `app/api/routes/device.py` |

### Auth, session and roles

- Auth is session-backed, not header-only.
- Browser identity comes from server-side session records in `auth_sessions`.
- Admin login is backed by persisted `portal_users` with role `admin`.
- Portal users may select an active role when multiple roles are assigned.
- CSRF protection applies to browser write flows.

Evidence:

- `app/api/routes/auth.py`
- `app/security/auth.py`
- `app/security/rbac.py`
- `app/db/models.py`

### Data model and migrations

Current models include at least:

- reports and report photos
- breakfast orders
- lost-found items and photos
- issues and issue photos
- inventory items, movements and audit logs
- audit trail
- portal users and roles
- SMTP settings
- devices
- auth lockout states
- auth sessions
- auth unlock tokens

Evidence:

- `app/db/models.py`
- `alembic/versions/*.py`

## Web inventory (`apps/kajovo-hotel-web`)

- Portal web implements dashboard plus CRUD routes for breakfast, lost_found, issues, inventory and reports.
- Utility routes `/intro`, `/offline`, `/maintenance`, `/404` are present.
- Web no longer hosts a second active admin app; `/admin/*` is retired in runtime behavior.
- Portal self-service profile/password flows are present.

Evidence:

- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`
- `apps/kajovo-hotel-web/src/rbac.ts`

## Admin inventory (`apps/kajovo-hotel-admin`)

- Standalone admin app is the active admin source of truth.
- Includes users, settings, profile/password, overview and operational module navigation.
- Still contains presentation debt on the dashboard and one stub route `/pokojska`.

Evidence:

- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-admin/src/rbac.ts`

## Shared/UI packages

- `packages/ui` provides shell, cards, forms, tables, state views and signage primitives.
- `packages/shared` exports generated client helpers, role helpers and shared domain types.

Evidence:

- `packages/ui/src/*`
- `packages/shared/src/*`

## Infra inventory (`infra/`)

- Compose stacks for dev/staging/prod
- reverse proxy configs plus cutover and rollback scripts
- smoke and verify scripts
- backup and restore PowerShell scripts

Evidence:

- `infra/compose*.yml`
- `infra/reverse-proxy/*`
- `infra/smoke/smoke.sh`
- `infra/verify/verify-deploy.sh`
- `infra/ops/*.ps1`
