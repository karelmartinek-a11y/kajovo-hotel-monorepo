# Modul Závady

## Přehled
Modul **Závady** pokrývá evidenci provozních závad hotelu včetně workflow stavu (`new` → `in_progress` → `resolved` → `closed`), priority, lokace/pokoje a volitelného přiřazení odpovědné osoby.

## API
- `GET /api/v1/issues` – seznam závad s filtry `priority`, `status`, `location`, `room_number`.
- `POST /api/v1/issues` – vytvoření závady.
- `GET /api/v1/issues/{id}` – detail závady.
- `PUT /api/v1/issues/{id}` – editace závady.
- `DELETE /api/v1/issues/{id}` – smazání závady.

## Datový model
Entita `issues` obsahuje:
- `title`, `description`
- `location`, `room_number`
- `priority`: `low|medium|high|critical`
- `status`: `new|in_progress|resolved|closed`
- `assignee` (volitelné)
- workflow timestampy: `in_progress_at`, `resolved_at`, `closed_at`
- audit: `created_at`, `updated_at`

## Web obrazovky
- `/zavady` – seznam s filtry (priority/stav/lokalita)
- `/zavady/:id` – detail + timeline
- `/zavady/nova` – vytvoření
- `/zavady/:id/edit` – editace

Každá route podporuje i dokončené view stavy přes `?state=` (`loading`, `empty`, `error`, `offline`, `maintenance`, `404`).
