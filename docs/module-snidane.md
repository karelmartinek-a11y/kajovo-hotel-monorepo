# Modul Snídaně

## Workflow pro personál

1. **Denní seznam** (`/snidane`): recepce nebo kuchyň zobrazí objednávky pro konkrétní den, vidí počet hostů a rozpad stavů.
2. **Detail objednávky** (`/snidane/:id`): personál otevře detail záznamu (pokoj, host, počet, stav, poznámka).
3. **Vytvoření objednávky** (`/snidane/nova`): rychlé zadání nové snídaně při check-inu nebo telefonické objednávce.
4. **Editace objednávky** (`/snidane/:id/edit`): změna počtu hostů, poznámky nebo posun stavu (čeká → připravuje se → vydáno / zrušeno).

## API routy

- `GET /api/v1/breakfast` — seznam objednávek, volitelné filtry `service_date` a `status`.
- `GET /api/v1/breakfast/daily-summary?service_date=YYYY-MM-DD` — denní souhrn (objednávky, hosté, stavy).
- `GET /api/v1/breakfast/{order_id}` — detail objednávky.
- `POST /api/v1/breakfast` — vytvoření objednávky.
- `PUT /api/v1/breakfast/{order_id}` — editace objednávky.
- `DELETE /api/v1/breakfast/{order_id}` — smazání objednávky.

## Datový model

`breakfast_orders`:

- `id` (PK)
- `service_date` (date)
- `room_number` (string)
- `guest_name` (string)
- `guest_count` (int)
- `status` (`pending | preparing | served | cancelled`)
- `note` (text, nullable)
- `created_at`, `updated_at`

## Stavové scénáře view

Každá route modulu podporuje finální stavy:

- `loading`
- `empty`
- `error`
- `offline`
- `maintenance`
- `404`

Přepínání stavů je dostupné přes query parametr `?state=<stav>` pro rychlou validaci v UI a Playwright.
