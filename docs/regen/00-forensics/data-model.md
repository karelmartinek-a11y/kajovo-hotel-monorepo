# Data model (forenzní mapa)

## 1) Identifikované entity (legacy)

### Auth + users
- `admin_singleton` — single admin heslo hash.
- `portal_users` — uživatelé portálu (email, role, aktivita, hash hesla).
- `portal_user_reset_tokens` — reset tokeny vazané na portal user.
- `portal_smtp_settings` — SMTP konfigurace pro reset e-maily.

### Device + reports/media
- `devices` — zařízení (status, role set, public key, token hash, timestamps).
- `reports` — hlášení (`report_type`, `status`, room, description, created_by_device_id, done metadata).
- `report_photos` — média k reportu (1:N z reportu).
- `report_history` — audit trail akcí/report status změn.

### Breakfast
- `breakfast_mail_config` — IMAP import konfigurace.
- `breakfast_days` — denní agregát importu (unikátní day).
- `breakfast_entries` — položky pokojů pro den (1:N z breakfast_days, unikát day+room).
- `breakfast_fetch_status` — diagnostický stav scheduleru/importu.

### Inventory
- `inventory_ingredients` — položky surovin + sklad v base jednotce.
- `inventory_stock_cards` — skladové karty IN/OUT.
- `inventory_stock_card_lines` — řádky karet (delta na ingredient).

## 2) Vztahy
- `portal_users (1) -> (N) portal_user_reset_tokens`.
- `devices (1) -> (N) reports`.
- `reports (1) -> (N) report_photos`.
- `reports (1) -> (N) report_history`.
- `breakfast_days (1) -> (N) breakfast_entries`.
- `inventory_stock_cards (1) -> (N) inventory_stock_card_lines`.
- `inventory_ingredients (1) -> (N) inventory_stock_card_lines`.

## 3) Enumy / doménové slovníky
- DeviceStatus: `PENDING | ACTIVE | REVOKED`.
- PortalUserRole: `housekeeping | frontdesk | maintenance | breakfast`.
- ReportType: `FIND | ISSUE`.
- ReportStatus: `OPEN | DONE`.
- ReportHistoryAction: `CREATED | MARK_DONE | REOPEN | DELETE`.
- InventoryUnit: `kg | g | l | ml | ks`.
- StockCardType: `IN | OUT`.

## 4) Základní validační pravidla (odvozená)
- Pokoje jsou omezené na whitelist (101–109, 201–210, 301–310) v report/breakfast logice.
- Report description má striktní délkové a znakové limity.
- Breakfast entries drží unikátnost den+pokoj.
- Inventory zásoby jsou počítané z card line delt; OUT karta používá záporné delta.
- Reset token má expiraci a jednorázové použití.

## 5) Mapování do nové parity vrstvy
- Legacy `reports` se mapují na nové moduly `reports`, `issues`, `lost_found` (funkčně rozdělené CRUD).
- Legacy inventory cards + lines zůstávají nutné pro auditovatelný výpočet stavu skladu.
- Legacy breakfast import data model je potřeba zachovat minimálně ve formě: konfigurace zdroje, denní snapshot, room entries, status importu.
