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
- `PATCH /api/v1/breakfast/{order_id}/reservations/{reservation_id}/diet` - změna jediné diety celého pobytu, tělo `{kind, enabled, version}`. Před zápisem ověřuje aktuální API rezervaci, pokoj a den; konflikt vrací 409, nedostupnost Better Hotel 502.
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
- synchronizace Better Hotel páruje řádky přes stabilní `source_key` a zachovává stav vydání a poznámku pro existující logickou snídani; diety promítá podle identity rezervace z `reservation_breakfast_diets`
- snídaně, která v nových externích datech zmizí, se z aktivního přehledu odstraní i tehdy, byla-li dříve vydaná
- mobilní přehled používá sticky hlavičku dne a kompaktní jednořádkový seznam `pokoj -> host -> poznámka -> diety -> akce`

UI modulu je odvozené jen z reálného runtime:

- `loading` vzniká jen po skutečném načítání dat z API
- `empty` vzniká jen když API vrátí prázdný seznam nebo nulový denní souhrn
- `error` vzniká jen při skutečné chybě API

Globální utility stavy `offline`, `maintenance` a `404` zůstávají samostatné route mimo query parametr simulace.

## Diety celého pobytu

`reservation_breakfast_diets` ukládá primární ID Better Hotel rezervace, tři příznaky (`diet_no_gluten`, `diet_no_milk` – Bez laktózy, `diet_no_pork`), verzi, autora a čas změny a metadata pobytu. Zapnutí i vypnutí platí zpětně i dopředu pro všechny existující snídaně od dne po příjezdu do odjezdu včetně; samo nevytváří snídaně. Budoucí synchronizace nastavení zachová i po změně pokoje či délky pobytu. Další rezervace ho nepřebírá.

API vrací v každé objednávce `reservations` s identitami, metadaty, dietami a verzí. Více pobytů má samostatné ovládání; souhrnné příznaky objednávky jsou OR jejich diet. Recepce/admin podle aktivní role mění jedinou dietu a verzi, ostatní role pouze čtou. Změna, denní projekce a audit jsou atomické; synchronizace a změny používají zámky rezervací ve stabilním pořadí. Zastaralá verze vrací 409 a frontend obnoví vybraný den, aniž zahodí rozepsané poznámky.

Migrace `0032_reservation_breakfast_diets` sjednotí každou dříve označenou dietu přes celý identifikovaný pobyt. Počty propojených a nepropojených záznamů vypíše bez osobních údajů. Nepropojitelné historické záznamy zachová, ale změny diet bez ověřené rezervace odmítne. Denní PUT ani PDF import nesmějí měnit pobytové diety; import zůstává dostupný bez dietních změn. Identita se nikdy neodhaduje z čísla pokoje nebo jména.

## Dopadová matice změny diet a karet

| Kategorie | Rozhodnutí |
|---|---|
| Produkční kód | Aktualizovat sdílené karty, oba snídaňové pohledy, API, projekci synchronizace a databázi. |
| Testy | Aktualizovat API, migraci, souběh, RBAC, UI a responzivní scénáře. |
| GitHub a gates | Ověřit beze změny: existující gates spouštějí dotčené testy i produkční image; zachovat automatické nasazování. |
| Dokumentace | Aktualizovat moduly Pokoje/Snídaně, import a RBAC. |
| Komentáře a poznámky | Aktualizovat kontrakt projekce a zamykání; odstranit výklad celoplošné zelené/pruhů. |
| Instrukce | Aktualizovat AGENTS o barvy podle dne a diety rezervací. |
| Fixtures a texty | Aktualizovat identitu pobytů, verze, barvy, noc pobytu a Bez laktózy. |
| Build a kontrakty | Aktualizovat OpenAPI, klienta, migraci a produkční čtecí validaci; ověřit oba frontendové buildy. |
