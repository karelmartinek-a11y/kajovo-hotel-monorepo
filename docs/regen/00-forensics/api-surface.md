# API surface (forenzní popis)

## 1) Aktuálně aktivní backend endpoints (legacy runtime)

### Health/system
- `GET /api/health` → `{ ok, app, time }`.
- `GET /api/v1/health` → alias na health.
- `GET /api/version` → deploy/environment/version metadata.
- `GET /api/internal/media-auth` → interní auth_request check (204 při autorizaci admina).

### Web-driven JSON endpoints (admin moduly)
- Breakfast admin JSON:
  - `GET /admin/breakfast/day`
  - `POST /admin/breakfast/check`
  - `POST /admin/breakfast/note`
  - `POST /admin/breakfast/import`
  - `POST /admin/breakfast/upload`
  - `POST /admin/breakfast/test`
- Inventory media:
  - `GET /admin/inventory/media/{ingredient_id}/{kind}`

## 2) Legacy API package surface (for parity reference)

### Reports (`legacy app/api/reports.py`)
- `POST /reports` — vytvoření hlášení + volitelné foto soubory.
- `GET /reports/open` — list otevřených hlášení (filtrování typ/stav).
- `POST /reports/mark-done` — uzavření hlášení.
- `GET /reports/photos/{photo_id}/thumb` — thumbnail média.
- `GET /poll/new-since` — polling nových hlášení.

Auth model:
- Device token (`X-Device-Token`, případně Bearer fallback) + aktivní zařízení.
- Role-gating dle typu hlášení (`FIND`/`ISSUE`).

Typické odpovědi/stavy:
- `200/201` úspěch.
- `400` validační chyba (room/type/photo payload).
- `401` chybějící nebo neplatná device autentizace.
- `403` role forbidden / neaktivní zařízení.
- `404` report/foto neexistuje.

### Device provisioning (`legacy app/api/device.py`)
- `POST /device/register`
- `GET /device/status`
- `GET /device/{device_id}/status` (compat)
- `POST /device/challenge`
- `POST /device/verify`

Auth model:
- Challenge-response kryptografie, následně vydání device tokenu.

Typické odpovědi/stavy:
- `200` status/challenge/verify success.
- `400` nevalidní device/public key/signature payload.
- `403` registration disabled / challenge invalid.
- `404` device nenalezen.
- `409` device revoked/not active/public key missing.

### Breakfast API (`legacy app/api/breakfast.py`)
- `GET /day`
- `POST /check`
- `POST /import`
- `POST /note`

Poznámka:
- V legacy je tato větev v device kontextu vracena jako disabled (`410 LEGACY_DEVICE_API_DISABLED`) a praktický provoz běží přes admin web endpointy.

## 3) Monorepo (nový API kontrakt k parity implementaci)

Base prefix: `/api/v1`

- Reports CRUD: `/reports` + `/{id}`.
- Lost&Found CRUD: `/lost-found` + `/{id}`.
- Issues CRUD: `/issues` + `/{id}`.
- Breakfast CRUD + daily summary: `/breakfast`, `/breakfast/daily-summary`.
- Inventory CRUD + movements: `/inventory`, `/inventory/{id}/movements`.

Auth model (aktuální stav):
- Header `x-role` je používán jako jednoduchý RBAC vstup pro API vrstvu (není produkční auth mechanika).

## 4) Paritní požadavky pro přepis
- Zachovat význam doménových akcí (provisioning, reports workflow, breakfast import/check, inventory cards/movements).
- Vynutit jednotný `/api/v1` namespace.
- Stabilizovat chybové kódy do konzistentního error contractu (4xx/5xx) s českými user-facing zprávami mapovanými v UI.
