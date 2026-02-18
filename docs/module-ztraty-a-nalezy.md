# Modul Ztráty a nálezy

## Přehled
Modul **Ztráty a nálezy** zavádí evidenci položek typu `lost` a `found` s workflow stavů:
- `stored`
- `claimed`
- `returned`
- `disposed`

## Informační architektura
Aktivované route:
- `/ztraty-a-nalezy` (seznam)
- `/ztraty-a-nalezy/:id` (detail)
- `/ztraty-a-nalezy/novy` (vytvoření)
- `/ztraty-a-nalezy/:id/edit` (editace)

Všechny view podporují stavy `default`, `loading`, `empty`, `error`, `offline`, `maintenance`, `404`.

## API
Prefix: `/api/v1/lost-found`

### Endpoints
- `GET /api/v1/lost-found`
  - filtry: `type`, `status`, `category`
- `GET /api/v1/lost-found/{item_id}`
- `POST /api/v1/lost-found`
- `PUT /api/v1/lost-found/{item_id}`
- `DELETE /api/v1/lost-found/{item_id}`

### Datový model
Povinná pole:
- `item_type`
- `description`
- `category`
- `location`
- `event_at`
- `status`

Volitelná pole:
- `claimant_name`
- `claimant_contact`
- `handover_note`
- `claimed_at`
- `returned_at`

## Frontend
Obrazovky používají komponenty z `packages/ui`:
- `AppShell`
- `Card`
- `DataTable`
- `FormField`
- `StateView`

### Seznam
- Filtrace podle typu a stavu.
- Přehledové KPI karty.

### Detail
- Tabulkový výpis metadat položky.
- Navigace na editaci.

### Formulář create/edit
- Workflow stav položky.
- Volitelná pole žadatele a předávacího záznamu.

## Testování
- API pytest pokrývá CRUD i filtrování.
- Playwright snapshoty pro list/detail/edit na viewportech phone/tablet/desktop.
