# Modul: Skladové hospodářství

## Přehled
Modul `Skladové hospodářství` pokrývá evidenci zásob a pohybů skladu pro provoz hotelu.

## Trasy
- `/sklad` - seznam skladových položek s indikací podlimitních zásob.
- `/sklad/nova` - vytvoření nové položky.
- `/sklad/:id` - detail položky včetně historie pohybů a auditní stopy.
- `/sklad/:id/edit` - editace položky.

Každá view podporuje stavy: `default`, `loading`, `empty`, `error`, `offline`, `maintenance`, `404`.

## API
- `GET /api/v1/inventory`
- `POST /api/v1/inventory`
- `GET /api/v1/inventory/{item_id}`
- `PUT /api/v1/inventory/{item_id}`
- `POST /api/v1/inventory/{item_id}/movements`
- `DELETE /api/v1/inventory/{item_id}`

Pohyby:
- `in` - navýšení skladu o `quantity`
- `out` - snížení skladu o `quantity` (validace proti zápornému stavu)
- `adjust` - přímé nastavení stavu skladu na `quantity`

## Validace formuláře
- `name` je povinný.
- `min_stock` a `current_stock` musí být celé číslo `>= 0`.
- `amount_per_piece_base` musí být celé číslo `>= 1`.
- Při odmítnutí ze strany API se detail chyby vrací zpět do UI místo generické hlášky.

## Audit
Auditní záznamy se ukládají do tabulky `inventory_audit_logs` pro akce create/update/movement/delete.

## Objednávka 180 vajec ve webovém skladu

Tlačítko je pro role s `inventory:write` v podepsané relaci CML.
Do 18:00 včetně se počítá zítřek, potom pozítří, v pásmu Europe/Prague.
Pokud vyjde neděle, závoz se posune na pondělí. Nový termín se po výslovném
potvrzení znovu ověří. Další objednávka do 24 hodin od posledního odeslání
vyžaduje ANO; dialog ukáže skutečný čas, starý a nový termín bez ohledu
na to, který pracovník objednávku odeslal.

Hotel nejprve uloží identitu pokusu a poté zavolá dedikovaný Mail MCP přístup.
`/app/data/credentials/egg-orders.json` je soubor 0600 s `endpoint`, `token`
a `recipient`; produkční adresát je pouze v privátní konfiguraci obou služeb.
Nejistý výsledek se ověřuje čtením stejné poštovní účtenky; opakované čtení
ani stejný požadavek e-mail znovu neodešle. Potvrzení ve skladu znamená
přijetí e-mailu poštovním serverem, termín od dodavatele se potvrzuje zvlášť.

Produkční přejímka 13. 11. 2026: Hotel API ze zdroje
`385c205245be1848e7a3519a2db9ac861a5da348`, image
`sha256:f79f752b3c3cf041869927abe14b5713b80d168ea4d78280c47d3206fd7648d9`,
PostgreSQL migrace `0053_inventory_egg_orders`. Úplná lokální kontrola
vydání prošla včetně dialogu ANO/NE v Chromium i WebKitu. V produkci byla
ověřena dostupnost API, odmítnutí bez relace a tlačítko v přihlášeném
skladu CML. Poštovní přístup prošel SDK discovery a čtením stavu bez SMTP.
Nebyla vytvořena žádná živá objednávka. Návrat používá původní image
`kajovo-hotel-found-form:f6e92c6ab88b` se zachovanou migrací a účtenkami.
