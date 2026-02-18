# Modul: Skladové hospodářství

## Přehled
Modul `Skladové hospodářství` pokrývá evidenci zásob a pohybů skladu pro provoz hotelu.

## Trasy
- `/sklad` – seznam skladových položek s indikací podlimitních zásob.
- `/sklad/nova` – vytvoření nové položky.
- `/sklad/:id` – detail položky včetně historie pohybů a auditní stopy.
- `/sklad/:id/edit` – editace položky.

Každá view podporuje stavy: `default`, `loading`, `empty`, `error`, `offline`, `maintenance`, `404`.

## API
- `GET /api/v1/inventory`
- `POST /api/v1/inventory`
- `GET /api/v1/inventory/{item_id}`
- `PUT /api/v1/inventory/{item_id}`
- `POST /api/v1/inventory/{item_id}/movements`
- `DELETE /api/v1/inventory/{item_id}`

Pohyby:
- `in` – navýšení skladu o `quantity`
- `out` – snížení skladu o `quantity` (validace proti zápornému stavu)
- `adjust` – přímé nastavení stavu skladu na `quantity`

## Audit
Auditní záznamy se ukládají do tabulky `inventory_audit_logs` pro akce create/update/movement/delete.
