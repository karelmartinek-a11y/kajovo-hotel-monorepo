# Modul Hlášení (`reports`)

## Přehled workflow

1. Uživatel otevře seznam `/hlaseni`.
2. Vytvoří záznam přes `/hlaseni/nove`.
3. Projde detail `/hlaseni/:id`.
4. Upraví záznam přes `/hlaseni/:id/edit`.

Každý view podporuje stavy: `loading`, `empty`, `error`, `offline`, `maintenance`, `404`.

## Routes

- `/hlaseni` — list
- `/hlaseni/nove` — create
- `/hlaseni/:id` — detail
- `/hlaseni/:id/edit` — edit

## API endpointy

Base path: `/api/v1/reports`

- `GET /api/v1/reports?status=<open|in_progress|closed>` — seznam s filtrem podle stavu
- `POST /api/v1/reports` — vytvoření
- `GET /api/v1/reports/{report_id}` — detail
- `PUT /api/v1/reports/{report_id}` — úprava
- `DELETE /api/v1/reports/{report_id}` — smazání

### Payload create/update

```json
{
  "title": "Nefunkční lampa",
  "description": "Popis závady",
  "status": "open"
}
```

Validace:
- `title`: 3–255 znaků
- `description`: max 4000 znaků
- `status`: `open | in_progress | closed`
