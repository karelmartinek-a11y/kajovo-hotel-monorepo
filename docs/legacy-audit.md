# Legacy audit (read-only source analysis)

## Scope and constraints
- This audit is based only on read-only legacy sources under `legacy/hotel-frontend` and `legacy/hotel-backend`.
- Legacy frontend and backend are tightly coupled by file sync scripts that copy templates and static assets into the backend web layer.

## 1) Frontend audit (`legacy/hotel-frontend`)

### 1.1 Templates/static structure
- Templates are server-side Jinja-style HTML files under `legacy/hotel-frontend/templates/` (e.g. `base.html`, `admin_*.html`, `portal_*.html`, `public_landing.html`).
- Shared partials are in `legacy/hotel-frontend/templates/partials/` (`brand_rail.html`, `kajovo_signage.html`).
- Static assets are under `legacy/hotel-frontend/static/` and include app CSS, multiple theme CSS files, brand assets, manifest/icons, and `frontend-version.json`.
- There is also a separate logo asset source tree under `legacy/hotel-frontend/LOGO/`.

### 1.2 Partials and layout composition
- `templates/base.html` includes `partials/brand_rail.html` in the top bar and defines all page-level layout blocks.
- `partials/brand_rail.html` includes `partials/kajovo_signage.html`, so signage is nested through a shared partial chain.
- Admin pages use `admin_sidebar.html` and `active_nav` to highlight current section.

### 1.3 Navigation/menu model
- Main top actions in frontend base layout include links to `/admin` and `/portal`.
- Admin sidebar menu contains: Dashboard, Ztráty a nálezy, Závady, Snídaně, Sklad, Uživatelé, Nastavení, Profil.
- Navigation selection is controlled by `active_nav` values used in templates.

### 1.4 Build steps and CI hints
- Frontend does not contain a Node build pipeline; `static/tailwind.css` explicitly states it is a prebuilt deterministic static file with no server build step.
- Operational deployment path is sync-based: frontend assets/templates are copied into backend (`sync-to-backend.sh` / `.ps1`).
- No dedicated CI pipeline file exists in this frontend subtree; the closest CI-style hint for the legacy system is backend sandbox test orchestration (see backend section).

## 2) Backend audit (`legacy/hotel-backend`)

### 2.1 Entrypoint and app bootstrap
- Primary runtime entrypoint is `app/main.py` with `create_app()` and exported `app = create_app()`.
- App startup runs a background breakfast fetch loop via lifespan (`breakfast_fetch_loop`).
- Static files are mounted from `app/web/static` on `/static`.

### 2.2 Routers (web + API)
- `app/main.py` includes web routers:
  - `app/web/routes.py` (public/portal/admin dashboard/reports/users/settings/profile/media)
  - `app/web/routes_admin.py` (breakfast admin module)
  - `app/web/routes_inventory.py` (inventory/stock cards module)
- JSON API routers exist under `app/api/`:
  - `reports.py` (`/reports`, `/reports/open`, workflow and polling)
  - `breakfast.py` (`/day`, `/check`, `/import`, `/note`)
  - `device.py` (device register/status/challenge/verify)
- API aggregator exists in `app/api/__init__.py`, but `app/main.py` currently wires only web routers.

### 2.3 Services, data, media
- Breakfast services are in `app/services/breakfast/`:
  - `mail_fetcher.py` (IMAP fetch + PDF ingest)
  - `parser.py` (parse/format breakfast data)
  - `scheduler.py` (time-window background loop)
- Media handling is in `app/media/`:
  - `storage.py`, `thumbnail.py`, `inventory_storage.py`.
- Database session/engine are in `app/db/session.py`.

### 2.4 DB and migrations
- SQLAlchemy models are centralized in `app/db/models.py`.
- Alembic is configured in `app/db/migrations/alembic.ini` and runtime environment in `app/db/migrations/env.py`.
- Migration versions are under `app/db/migrations/versions/` (device roles, breakfast tables/config, inventory quantities, portal users/smtp, auth refactor, etc.).

### 2.5 Auth and security
- Admin auth + session helpers: `app/security/admin_auth.py`.
- User portal session/auth: `app/security/user_auth.py`.
- CSRF middleware + helpers: `app/security/csrf.py`.
- Rate limiting middleware: `app/security/rate_limit.py`.
- Crypto/device crypto: `app/security/crypto.py`, `app/security/device_crypto.py`.
- App also configures CORS, Session middleware, CSRF middleware, and security headers in `app/main.py`.

### 2.6 Web serving (templates/static)
- Jinja templates are served from `app/web/templates` (`Jinja2Templates(directory="app/web/templates")` used in route modules).
- Static is served by FastAPI mount `/static -> app/web/static`.
- This confirms backend is the runtime web server for both admin and portal UI.

### 2.7 Build/deploy/CI hints
- Python project config and dev tooling declarations are in `pyproject.toml` (includes `ruff`, `mypy`, `pytest` in optional dev deps).
- Container runtime defined by `deploy/Dockerfile` + `deploy/entrypoint.sh` (DB wait, optional alembic migrate, Gunicorn boot).
- Compose deployment skeleton is in `deploy/docker-compose.yml`.
- A strong CI-like operational script exists as `deploy/sandbox/run-tests.sh` (sandbox environment creation + health/login checks).

## 3) Frontend integration into backend (critical coupling)

### 3.1 Sync/copy mechanism
- Frontend script `legacy/hotel-frontend/sync-to-backend.sh`:
  - Optionally updates `static/frontend-version.json` to current git short commit.
  - `rsync --delete` from frontend `static/` -> backend `app/web/static/`.
  - `rsync --delete` from frontend `templates/` -> backend `app/web/templates/`.
- Backend wrapper `legacy/hotel-backend/sync-from-frontend.sh` calls frontend sync script with backend path.
- Equivalent PowerShell versions exist: `sync-to-backend.ps1` and `sync-from-frontend.ps1`.

### 3.2 Version marker and release traceability
- `frontend-version.json` exists in both frontend and backend static trees.
- Sync scripts can stamp `frontend_commit` based on git commit, creating a lightweight provenance marker for deployed UI payload.

### 3.3 Implications
- Backend templates/static are generated deployment artifacts from frontend source, not independently authored at runtime.
- Any migration must remove this rsync coupling and make `apps/kajovo-hotel-web` the build/deploy source of truth.

## 4) Functional modules and code locations

### 4.1 Ztráty a nálezy (findings)
- Domain type in DB: `ReportType.FIND` in `app/db/models.py`.
- Admin UI routes: `/admin/reports/findings` and generic report list/detail actions in `app/web/routes.py`.
- Device/API flow for report creation/list: `app/api/reports.py`.
- UI templates: `app/web/templates/admin_reports_list.html`, `admin_report_detail.html`.

### 4.2 Závady (issues)
- Domain type in DB: `ReportType.ISSUE` in `app/db/models.py`.
- Admin UI routes: `/admin/reports/issues` and same report workflow handlers in `app/web/routes.py`.
- API flow shared with findings in `app/api/reports.py`.
- UI templates shared with findings (filter/type-specific behavior in route context).

### 4.3 Snídaně (breakfast)
- Admin web module: `app/web/routes_admin.py` with `/admin/breakfast` endpoints.
- API module: `app/api/breakfast.py`.
- Services: `app/services/breakfast/mail_fetcher.py`, `parser.py`, `scheduler.py`.
- DB tables/models: `BreakfastMailConfig`, `BreakfastDay`, `BreakfastEntry`, `BreakfastFetchStatus` in `app/db/models.py`.
- UI template: `app/web/templates/admin_breakfast.html`.

### 4.4 Sklad (inventory)
- Admin web module: `app/web/routes_inventory.py`.
- DB models: `InventoryIngredient`, `StockCard`, `StockCardLine`, unit/card enums in `app/db/models.py`.
- Media support for pictograms: `app/media/inventory_storage.py`.
- UI templates: `app/web/templates/admin_inventory*.html` (ingredients, stock, movements).

### 4.5 Uživatelé / portál auth
- Portal/admin user management routes in `app/web/routes.py` (`/admin/users`, reset flow, SMTP settings).
- Models: `PortalUser`, `PortalUserRole`, `PortalUserResetToken`, `PortalSmtpSettings` in `app/db/models.py`.
- Templates: `admin_users.html`, `portal_login.html`, `portal_forgot.html`, `portal_reset.html`, `portal_home.html`.

### 4.6 Device auth + polling integration
- Device lifecycle endpoints: `app/api/device.py`.
- Device model + status/roles in `app/db/models.py`.
- Crypto and anti-replay helpers in `app/security/device_crypto.py` and `app/security/crypto.py`.
