# Modul Snídaně

## Workflow pro personál

1. **Denní seznam** (`/snidane` nebo `/admin/snidane`): role `snídaně`, `recepce` a `admin` zobrazí přehled pro konkrétní den a pracují přímo s vydáním, poznámkou a dietami.
2. **Detail objednávky** (`/snidane/:id`): personál otevře detail záznamu (pokoj, host, počet, stav, poznámka).
3. **Vytvoření objednávky** (`/snidane/nova`): rychlé zadání nové snídaně při check-inu nebo telefonické objednávce.
4. **Editace objednávky** (`/snidane/:id/edit`): změna počtu hostů, poznámky nebo posun stavu (`pending` -> `preparing` -> `served` nebo `cancelled`).

## API routy

- `GET /api/v1/breakfast` - seznam objednávek, volitelné filtry `service_date` a `status`.
- `GET /api/v1/breakfast/daily-summary?service_date=YYYY-MM-DD` - denní souhrn (objednávky, hosté, stavy).
- `GET /api/v1/breakfast/{order_id}` - detail objednávky.
- `POST /api/v1/breakfast` - vytvoření objednávky.
- `PUT /api/v1/breakfast/{order_id}` - editace objednávky, vydání/revokace a ukládání poznámky.
- `DELETE /api/v1/breakfast/{order_id}` - smazání objednávky.

## Datový model

`breakfast_orders`:

- `id` (PK)
- `service_date` (date)
- `source_key` (string, nullable) pro stabilní identitu synchronizované snídaně
- `room_number` (string)
- `guest_name` (string)
- `guest_count` (int)
- `status` (`pending | preparing | served | cancelled`)
- `note` (text, nullable)
- `created_at`, `updated_at`

## Stavové scénáře view

## Aktivní provozní kontrakt

- tlačítko `Vydat` ukládá stav `served` trvale do backendu a databáze
- revokaci `served -> pending` smí provést pouze `recepce` nebo `admin`; role `snídaně` vidí jen potvrzený stav na tlačítku
- poznámka se ukládá automaticky při `blur` jen při změně hodnoty a backend hlídá konflikt přes `expected_updated_at`
- synchronizace Better Hotel páruje řádky přes stabilní `source_key` a zachovává interní stav vydání, poznámku i dietní příznaky jen pro stále existující logickou snídani
- snídaně, která v nových externích datech zmizí, se z aktivního přehledu odstraní i tehdy, byla-li dříve vydaná
- mobilní přehled používá sticky hlavičku dne a kompaktní jednořádkový seznam `pokoj -> host -> poznámka -> diety -> akce`

UI modulu je odvozené jen z reálného runtime:

- `loading` vzniká jen po skutečném načítání dat z API
- `empty` vzniká jen když API vrátí prázdný seznam nebo nulový denní souhrn
- `error` vzniká jen při skutečné chybě API

Globální utility stavy `offline`, `maintenance` a `404` zůstávají samostatné route mimo query parametr simulace.
