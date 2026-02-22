# New system inventory (mimo /legacy)

## Moduly

- Dashboard/Přehled
- Snídaně
- Ztráty a nálezy
- Závady
- Skladové hospodářství
- Hlášení
- Utility stavy (`/intro`, `/offline`, `/maintenance`, `/404`)

## Frontend routy

Zdroj: `apps/kajovo-hotel-web/src/main.tsx`, `apps/kajovo-hotel/ux/ia.json`.

- `/`
- `/snidane`
- `/snidane/nova`
- `/snidane/:id`
- `/snidane/:id/edit`
- `/ztraty-a-nalezy`
- `/ztraty-a-nalezy/novy`
- `/ztraty-a-nalezy/:id`
- `/ztraty-a-nalezy/:id/edit`
- `/zavady`
- `/zavady/nova`
- `/zavady/:id`
- `/zavady/:id/edit`
- `/sklad`
- `/sklad/nova`
- `/sklad/:id`
- `/sklad/:id/edit`
- `/hlaseni`
- `/hlaseni/nove`
- `/hlaseni/:id`
- `/hlaseni/:id/edit`
- `/intro`
- `/offline`
- `/maintenance`
- `/404`
- `/dalsi` (redirect)

## API endpointy

Zdroj: `apps/kajovo-hotel-api/app/api/routes/*.py`.

- `GET /health`
- `GET /ready`
- `GET /api/v1/reports`
- `GET /api/v1/reports/{report_id}`
- `POST /api/v1/reports`
- `PUT /api/v1/reports/{report_id}`
- `DELETE /api/v1/reports/{report_id}`
- `GET /api/v1/breakfast`
- `GET /api/v1/breakfast/daily-summary`
- `GET /api/v1/breakfast/{order_id}`
- `POST /api/v1/breakfast`
- `PUT /api/v1/breakfast/{order_id}`
- `DELETE /api/v1/breakfast/{order_id}`
- `GET /api/v1/lost-found`
- `GET /api/v1/lost-found/{item_id}`
- `POST /api/v1/lost-found`
- `PUT /api/v1/lost-found/{item_id}`
- `DELETE /api/v1/lost-found/{item_id}`
- `GET /api/v1/issues`
- `GET /api/v1/issues/{issue_id}`
- `POST /api/v1/issues`
- `PUT /api/v1/issues/{issue_id}`
- `DELETE /api/v1/issues/{issue_id}`
- `GET /api/v1/inventory`
- `POST /api/v1/inventory`
- `GET /api/v1/inventory/{item_id}`
- `PUT /api/v1/inventory/{item_id}`
- `POST /api/v1/inventory/{item_id}/movements`
- `DELETE /api/v1/inventory/{item_id}`

## Datové entity

Zdroj: `apps/kajovo-hotel-api/app/db/models.py`.

- `Report`
- `BreakfastOrder`
- `LostFoundItem`
- `Issue`
- `InventoryItem`
- `InventoryMovement`
- `InventoryAuditLog`
- `AuditTrail`

## Ověření absence device / Entity ID flow v novém cíli

- V `apps/kajovo-hotel-api/app/api/routes/*` není žádný `/device/*` endpoint.
- V `apps/kajovo-hotel-web/src/*` není route pro device provisioning/pairing.
- V novém API modelu není entita `Device`.
