# Legacy inventory (source of truth)

## Backend inventory (`legacy/hotel-backend`)

### API endpoints

| Module | Endpoints (method path) | Evidence |
|---|---|---|
| Breakfast device API | `GET /v1/breakfast/day`, `POST /v1/breakfast/check`, `POST /v1/breakfast/import`, `POST /v1/breakfast/note` | `legacy/hotel-backend/app/api/breakfast.py` |
| Reports/device API | `POST /reports`, `GET /reports/open`, `POST /reports/mark-done`, `GET /reports/photos/{photo_id}/thumb`, `GET /poll/new-since` | `legacy/hotel-backend/app/api/reports.py` |
| Device provisioning/auth | `POST /device/register`, `GET /device/status`, `GET /device/{device_id}/status`, `POST /device/challenge`, `POST /device/verify` | `legacy/hotel-backend/app/api/device.py` |
| Health/system | `GET /api/health`, `GET /api/version`, `GET /api/v1/health`, `GET /api/internal/media-auth` | `legacy/hotel-backend/app/main.py` |

### Server-rendered web/admin routes

| Module | Routes | Evidence |
|---|---|---|
| Public + auth | `/`, `/admin`, `/admin/login`, `/login`, `/login/forgot`, `/login/reset`, `/portal`, `/logout`, `/admin/logout` | `legacy/hotel-backend/app/web/routes.py` |
| Reports admin | `/admin/reports`, `/admin/reports/findings`, `/admin/reports/issues`, `/admin/reports/{report_id}`, `/admin/reports/{report_id}/done`, `/admin/reports/{report_id}/reopen`, `/admin/reports/{report_id}/delete`, `/admin/media/{photo_id}/{kind}` | `legacy/hotel-backend/app/web/routes.py` |
| Users/settings/profile | `/admin/users`, `/admin/users/create`, `/admin/users/{user_id}/send-reset`, `/admin/settings`, `/admin/settings/smtp`, `/admin/profile`, `/admin/profile/password` | `legacy/hotel-backend/app/web/routes.py` |
| Breakfast admin | `/admin/breakfast`, `/admin/breakfast/day`, `/admin/breakfast/check`, `/admin/breakfast/note`, `/admin/breakfast/import`, `/admin/breakfast/save`, `/admin/breakfast/upload`, `/admin/breakfast/test` | `legacy/hotel-backend/app/web/routes_admin.py` |
| Inventory admin | `/admin/inventory`, `/admin/inventory/ingredients`, `/admin/inventory/stock`, `/admin/inventory/movements`, plus ingredient/card CRUD + pictogram upload/media | `legacy/hotel-backend/app/web/routes_inventory.py` |

### Services/modules packages

- `app/services/breakfast/` includes parser, mail fetcher, and scheduler for overnight import. Evidence: `legacy/hotel-backend/app/services/breakfast/parser.py`, `mail_fetcher.py`, `scheduler.py`.
- `app/media/` includes storage, inventory media storage, and thumbnails. Evidence: `legacy/hotel-backend/app/media/storage.py`, `inventory_storage.py`, `thumbnail.py`.
- `app/security/` includes admin session auth, portal user sessions, CSRF, device crypto, rate limiting. Evidence: `legacy/hotel-backend/app/security/*.py`.

### DB models/tables and migrations

- Core tables in models include: `admin_singleton`, `portal_users`, `portal_user_reset_tokens`, `portal_smtp_settings`, `devices`, `report`, `report_history`, `report_photo`, `breakfast_entry`, `breakfast_check`, `inventory_ingredient`, `inventory_card`, `inventory_card_item` (+ enum types for roles/statuses). Evidence: `legacy/hotel-backend/app/db/models.py`.
- Alembic migrations present:
  - `0001_device_roles.py`
  - `0002_breakfast_tables.py`
  - `0003_breakfast_checks.py`
  - `0004_breakfast_admin_config.py`
  - `0005_breakfast_guest_name.py`
  - `0006_breakfast_note.py`
  - `0007_inventory_qty_pieces.py`
  - `0008_portal_users_smtp.py`
  - `0009_auth_refactor.py`
  Evidence: `legacy/hotel-backend/app/db/migrations/versions/`.

### Auth/roles/permissions logic

- Admin auth uses single admin password hash in `admin_singleton`, session cookies, passlib hash verify, and admin-route guard redirecting unauthenticated users. Evidence: `legacy/hotel-backend/app/security/admin_auth.py`.
- Portal user auth uses signed cookie sessions (`itsdangerous`) and user id binding. Evidence: `legacy/hotel-backend/app/security/user_auth.py`.
- Device auth uses challenge/verify, token hashing, device roles gate for report categories. Evidence: `legacy/hotel-backend/app/api/device.py`, `legacy/hotel-backend/app/api/reports.py`.

### Template/static integration

- Static assets mounted at `/static` from `app/web/static`. Evidence: `legacy/hotel-backend/app/main.py`.
- Jinja templates rendered from `app/web/templates/` for admin, auth, reports, breakfast, inventory, users/settings/profile and shared partials. Evidence: `legacy/hotel-backend/app/web/templates/*.html`, `partials/*.html`.

## Frontend inventory (`legacy/hotel-frontend` + backend templates/static)

### Pages/views/templates

- Main templates: `public_landing.html`, `portal_login.html`, `portal_home.html`, `portal_forgot.html`, `portal_reset.html`, `admin_login.html`, `admin_dashboard.html`, `admin_breakfast.html`, `admin_reports_list.html`, `admin_report_detail.html`, `admin_inventory*.html`, `admin_users.html`, `admin_settings.html`, `admin_profile.html`, `base.html`.
- Navigation items in admin sidebar: Dashboard, Ztráty a nálezy, Závady, Snídaně, Sklad, Uživatelé, Nastavení, Profil. Evidence: `legacy/hotel-frontend/templates/admin_sidebar.html` and mirrored `legacy/hotel-backend/app/web/templates/admin_sidebar.html`.

### Forms and workflows by module

- Auth workflow: login, forgot password, reset password, logout (portal + admin). Evidence: `legacy/hotel-frontend/routes.py`.
- Reports workflow: lists, detail, mark done, reopen, delete. Evidence: `legacy/hotel-frontend/routes.py`, `admin_reports_list.html`, `admin_report_detail.html`.
- Breakfast workflow: day view, check/uncheck, note update, PDF import/upload/save, SMTP test. Evidence: `legacy/hotel-frontend/routes_admin.py`, `admin_breakfast.html`.
- Inventory workflow: ingredients/cards create/update/delete, stock/movement screens, pictogram upload and media serving. Evidence: `legacy/hotel-backend/app/web/routes_inventory.py`, `admin_inventory*.html`.
- Users/settings/profile workflow: user create + send reset, SMTP settings, password change. Evidence: `legacy/hotel-frontend/routes.py`, `admin_users.html`, `admin_settings.html`, `admin_profile.html`.

### Client-side logic and integration points

- Most behavior is server-rendered with form POST actions to FastAPI endpoints.
- Dynamic client behavior is primarily inline JS in templates (e.g., breakfast admin controls using `data-admin-breakfast-*` hooks) plus deploy stamp script. Evidence: `legacy/hotel-backend/app/web/templates/admin_breakfast.html`, `legacy/hotel-frontend/static/deploy-stamp.js`.
