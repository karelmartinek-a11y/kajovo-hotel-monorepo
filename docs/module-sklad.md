# Modul: Skladové hospodářství

## Přehled
V sekci KájovoHotel jsou dvě samostatné podsekce **Sklad Snídaně** a
**Sklad Drogerie**. Obě mají stejné formuláře a oprávnění pro evidenci
položek, příjem, výdej, odpis, doklady, historii, piktogramy a PDF inventuru.
Provozní přehled načítá stav každého skladu zvlášť.

## Trasy

CML otevírá `/sections/hotel/?view=inventory` pro Sklad Snídaně a
`/sections/hotel/?view=inventory-drogerie` pro Sklad Drogerie. Původní
adresy zaměstnaneckého webu používají Sklad Snídaně.

- `/sklad` - seznam skladových položek s indikací podlimitních zásob.
- `/sklad/nova` - vytvoření nové položky.
- `/sklad/:id` - detail položky včetně historie pohybů a auditní stopy.
- `/sklad/:id/edit` - editace položky.

Každá view podporuje stavy: `default`, `loading`, `empty`, `error`, `offline`, `maintenance`, `404`.

## API
Parametr `warehouse` nabývá hodnot `snidane` a `drogerie`. Bez parametru
se vždy použije Sklad Snídaně. Původní klienti tak používají stejné adresy.
Hotel ověřuje místní účet v hlavní databázi a u člena CML vyžaduje
podepsané právo `hotel.inventory.snidane` nebo `hotel.inventory.drogerie`
podle cíle požadavku. Každé právo umožňuje čtení i obsluhu jednoho skladu.
Stejnou podmínku mají navigace, piktogramy, PDF, doklady, stavové změny
a čtení jejich účtenek. Starší účtenka bez rozlišení skladu vyžaduje
přístup k oběma skladům. Původní nativní role skladníka trvale používá
Sklad Snídaně. Správce Hotelu má oba sklady.

- `GET /api/v1/inventory`
- `POST /api/v1/inventory`
- `GET /api/v1/inventory/{item_id}`
- `PUT /api/v1/inventory/{item_id}`
- `POST /api/v1/inventory/{item_id}/movements`
- `DELETE /api/v1/inventory/{item_id}`

Pohyby:
- `in` - navýšení skladu o `quantity`
- `out` - snížení skladu o `quantity` (validace proti zápornému stavu)
- `adjust` - odpis `quantity` (validace proti zápornému stavu)

## Validace formuláře
- `name` je povinný.
- `min_stock` a `current_stock` musí být celé číslo `>= 0`.
- `amount_per_piece_base` musí být celé číslo `>= 1`.
- Při odmítnutí ze strany API se detail chyby vrací zpět do UI místo generické hlášky.

## Audit
Auditní záznamy se ukládají do tabulky `inventory_audit_logs` pro akce create/update/movement/delete.

## Databáze a nasazení

Produkční PostgreSQL používá dvě databáze odvozené od názvu hlavní databáze
Hotelu s příponami `_sklad_snidane` a `_sklad_drogerie`. Před prvním startem
je založ jako prázdné databáze ve stejném clusteru s vlastníkem shodným
s účtem Hotel API. API vytvoří skladové tabulky v obou databázích a při
nedostupnosti některé z nich start nedokončí. Při každém dalším startu
tabulky a data zůstávají zachované. Piktogramy mají samostatné adresáře
`inventory/snidane/ingredients` a `inventory/drogerie/ingredients`.

Při přechodu se původní skladové tabulky a piktogramy ponechají ve svém
úložišti pro návrat. Do aktivních skladů se nekopírují. Před přepnutím
ověř nulové počty položek, řádků dokladů, dokladů, pohybů a auditu v cílových
databázích. Návrat předchozího image obnoví původní skladový pohled a data
nových skladů zůstanou ve vlastních databázích. Pokud v nich mezitím vznikly
zápisy, vyhodnoť obnovení provozu s jejich vědomím před přepnutím zpět.

Lokální a testovací instalace mohou aktivovat obě samostatné databáze přes
`KAJOVO_API_WAREHOUSE_SEPARATE_DATABASES=true`. Bez tohoto nastavení
si vývojová instalace zachová původní data jako Sklad Snídaně. Samostatný
Sklad Drogerie potřebuje vždy vlastní soubor SQLite nebo databázi PostgreSQL.

Změna zasahuje Hotel API a CML skladové obrazovky, jejich manifest a překlady,
OpenAPI s TypeScript klientem a skladové testy. Při přechodu zachová
Hotel starému podepsanému grantu `hotel.inventory` jeho dosavadní přístup
k oběma skladům. CML editor ukládá obě práva samostatně. Nasazení
Hotel API musí předcházet nasazení nového katalogu CML.
Databázová inicializace se ověřuje při startu API a testy
procházejí izolovaným HTTP tokem se skutečnými zápisy a následným čtením.

## Objednávka 180 vajec ve webovém skladu

Tlačítko je v obou skladech pro role s `inventory:write` v podepsané
relaci CML. Historii objednávek využívají oba sklady společně kvůli
obnově účtenek a kontrole opakovaného odeslání.
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
