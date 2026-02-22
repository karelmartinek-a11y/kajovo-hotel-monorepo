# Legacy inventory (/legacy) — seznamová forenzní evidence

## Moduly

- Auth + sessions (admin/portal/device)
- Reports (ztráty a nálezy + závady)
- Breakfast
- Inventory
- Users / SMTP settings / admin profile
- Media + thumbnails

## Routy (SSR/admin/portal)

Zdroj: `legacy/hotel-backend/app/web/routes.py`, `legacy/hotel-backend/app/web/routes_admin.py`, `legacy/hotel-backend/app/web/routes_inventory.py`.

- `/`
- `/admin`
- `/admin/login`
- `/login`
- `/login/forgot`
- `/login/reset`
- `/portal`
- `/logout`
- `/admin/logout`
- `/admin/dashboard`
- `/admin/reports/findings`
- `/admin/reports/issues`
- `/admin/reports`
- `/admin/reports/{report_id}`
- `/admin/reports/{report_id}/done`
- `/admin/reports/{report_id}/reopen`
- `/admin/reports/{report_id}/delete`
- `/admin/media/{photo_id}/{kind}`
- `/admin/users`
- `/admin/users/create`
- `/admin/users/{user_id}/send-reset`
- `/admin/settings`
- `/admin/settings/smtp`
- `/admin/profile`
- `/admin/profile/password`
- `/admin/breakfast`
- `/admin/breakfast/day`
- `/admin/breakfast/check`
- `/admin/breakfast/note`
- `/admin/breakfast/import`
- `/admin/breakfast/save`
- `/admin/breakfast/upload`
- `/admin/breakfast/test`
- `/admin/inventory`
- `/admin/inventory/ingredients`
- `/admin/inventory/stock`
- `/admin/inventory/movements`
- `/admin/inventory/ingredient/create`
- `/admin/inventory/ingredient/{ingredient_id}/update`
- `/admin/inventory/ingredient/{ingredient_id}/delete`
- `/admin/inventory/ingredient/{ingredient_id}/pictogram`
- `/admin/inventory/cards/create`
- `/admin/inventory/cards/{card_id}/update`
- `/admin/inventory/cards/{card_id}/delete`
- `/admin/inventory/media/{ingredient_id}/{kind}`

## Endpointy (API)

Zdroj: `legacy/hotel-backend/app/api/*.py`, `legacy/hotel-backend/app/main.py`.

- `GET /v1/breakfast/day`
- `POST /v1/breakfast/check`
- `POST /v1/breakfast/import`
- `POST /v1/breakfast/note`
- `POST /reports`
- `GET /reports/open`
- `POST /reports/mark-done`
- `GET /reports/photos/{photo_id}/thumb`
- `GET /poll/new-since`
- `POST /device/register`
- `GET /device/status`
- `GET /device/{device_id}/status`
- `POST /device/challenge`
- `POST /device/verify`
- `GET /api/health`
- `GET /api/version`
- `GET /api/v1/health`
- `GET /api/internal/media-auth`

## Datové entity

Zdroj: `legacy/hotel-backend/app/db/models.py`.

- `AdminSingleton`
- `PortalUser`
- `PortalUserResetToken`
- `PortalSmtpSettings`
- `Device`
- `Report`
- `ReportPhoto`
- `ReportHistory`
- `BreakfastMailConfig`
- `BreakfastDay`
- `BreakfastEntry`
- `BreakfastFetchStatus`
- `InventoryIngredient`
- `StockCard`
- `StockCardLine`
