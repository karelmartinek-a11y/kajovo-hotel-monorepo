# New-system inventory

## API inventory (`apps/kajovo-hotel-api`)

### Endpoints by module

| Module | Base prefix | Endpoints (method path) | Evidence |
|---|---|---|---|
| Health | `/` | `GET /health`, `GET /ready` | `app/api/routes/health.py` |
| Breakfast | `/api/v1/breakfast` | `GET /`, `GET /daily-summary`, `GET /{order_id}`, `POST /`, `PUT /{order_id}`, `DELETE /{order_id}` | `app/api/routes/breakfast.py` |
| Lost & Found | `/api/v1/lost-found` | `GET /`, `GET /{item_id}`, `POST /`, `PUT /{item_id}`, `DELETE /{item_id}` | `app/api/routes/lost_found.py` |
| Issues | `/api/v1/issues` | `GET /`, `GET /{issue_id}`, `POST /`, `PUT /{issue_id}`, `DELETE /{issue_id}` | `app/api/routes/issues.py` |
| Inventory | `/api/v1/inventory` | `GET /`, `POST /`, `GET /{item_id}`, `PUT /{item_id}`, `POST /{item_id}/movements`, `DELETE /{item_id}` | `app/api/routes/inventory.py` |
| Reports | `/api/v1/reports` | `GET /`, `GET /{report_id}`, `POST /`, `PUT /{report_id}`, `DELETE /{report_id}` | `app/api/routes/reports.py` |

### Services/modules

- API modules are implemented as route-level CRUD handlers with SQLAlchemy models and Pydantic schemas, no separate service layer package equivalent to legacy `app/services`. Evidence: `app/api/routes/*.py`, `app/api/schemas.py`.
- Legacy migration utility exists for data import path. Evidence: `tools/migrate_legacy/migrate.py`.

### DB models and migrations

- Models include: `Report`, `BreakfastOrder`, `LostFoundItem`, `Issue`, `InventoryItem`, `InventoryMovement`, `InventoryAuditLog`, `AuditTrail` (+ enum types). Evidence: `app/db/models.py`.
- Alembic migrations present:
  - `0001_create_reports_table.py`
  - `0002_create_breakfast_orders_table.py`
  - `0003_create_lost_found_items_table.py`
  - `0004_create_issues_table.py`
  - `0005_create_inventory_tables.py`
  - `0006_add_updated_at_to_reports.py`
  - `0007_create_audit_trail_table.py`
  - `0008_add_actor_identity_to_audit_trail.py`
  Evidence: `alembic/versions/`.

### Auth/roles/permissions logic

- RBAC implemented via request-header identity (`x-user-id`, `x-user-role`) and module permission matrix with read/write separation by HTTP method. Evidence: `app/security/rbac.py`.
- No device challenge/verify API, no cookie/session admin auth endpoints in new API.

## Web inventory (`apps/kajovo-hotel-web` + `apps/kajovo-hotel/ux/ia.json`)

### IA and actual routes

- IA declares modules: dashboard, breakfast, lost_found, issues, inventory, reports (+ inactive `other`) and utility views (`/intro`, `/offline`, `/maintenance`, `/404`). Evidence: `apps/kajovo-hotel/ux/ia.json`.
- Actual React routes include dashboard + full CRUD views for breakfast/lost_found/issues/inventory/reports, utility routes, `/dalsi` redirect, and catch-all redirect to `/404`. Evidence: `apps/kajovo-hotel-web/src/main.tsx`.

### IA mismatch check

- IA route `lost_found` module route is `/ztraty-a-nalezy` and aligns with web implementation.
- IA module `inventory.routes` and `reports.routes` include list/detail/create/edit and align with React routes.
- IA defines `/intro`, `/offline`, `/maintenance`, `/404`, all implemented as lazy utility routes.
- Implementation has extra explicit create routes for breakfast/lost_found/issues (`/snidane/nova`, `/ztraty-a-nalezy/novy`, `/zavady/nova`) that are not exhaustively listed in IA `modules` but are covered in IA `views` entries.

### Workflow completeness in web

- Implemented module workflows with list/detail/create/edit screens for breakfast, lost_found, issues, inventory, reports. Evidence: `apps/kajovo-hotel-web/src/main.tsx` and typed API client usage from `@kajovo/shared`.
- No admin user management/settings/profile/auth UI equivalent to legacy admin templates.

### Shared/UI packages

- `packages/ui` provides shell, cards, tables, state views, and signage components used by web app. Evidence: `packages/ui/src/*`.
- `packages/shared` provides generated API client and exported types consumed by web app. Evidence: `packages/shared/src/generated/client.ts`, `packages/shared/src/index.ts`.

## Infra inventory (`infra/`)

- Compose stacks: dev, staging, prod, hotel-specific prod compose files. Evidence: `infra/dev-compose.yml`, `infra/compose.staging.yml`, `infra/compose.prod.yml`, `infra/compose.prod.hotel-hcasc.yml`.
- Reverse proxy configs and cutover scripts for legacy/new switch and rollback. Evidence: `infra/reverse-proxy/*.conf`, `infra/reverse-proxy/switch-to-new.sh`, `infra/reverse-proxy/rollback-to-legacy.sh`.
- Smoke test script present. Evidence: `infra/smoke/smoke.sh`.
- Deploy and verify scripts present. Evidence: `infra/ops/deploy-production.sh`, `infra/verify/verify-deploy.sh`.
- Backup/restore scripts present (PowerShell). Evidence: `infra/ops/backup.ps1`, `infra/ops/restore.ps1`.
