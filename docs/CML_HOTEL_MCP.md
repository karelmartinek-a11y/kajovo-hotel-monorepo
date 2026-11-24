# MCP KájovoHotelu

MCP zpřístupňuje snídaně, ztráty a nálezy, pokoje a úklid, závady a oba
sklady podle oprávnění připojení.

| Nástroj | Stávající chování, na které navazuje |
| --- | --- |
| `breakfast_day_get` | Souhrn za den a stránka objednávek z denního přehledu. |
| `breakfast_order_get` | Detail objednávky podle ID a verze, rezervace a diety na vyžádání. |
| `breakfast_daily_export` | PDF pro zvolený den přes přihlášený CML. |
| `lost_found_list` | Filtrovaný a stránkovaný přehled s ID a stavem. |
| `lost_found_get` | Vybraný záznam včetně popisu a metadat fotografií. |
| `lost_found_photo_get` | Odkaz na náhled nebo originál vybrané fotografie přes přihlášený CML. |
| `breakfast_order_create`, `breakfast_order_update`, `breakfast_order_delete` | Ruční objednávka, úprava podle aktuálního `updated_at` a smazání podle ID. |
| `breakfast_diet_set` | Nastavení jedné diety pro ověřenou rezervaci objednávky. |
| `breakfast_orders_reactivate`, `breakfast_orders_delete` | Reaktivace objednávek za den, smazání za den nebo uzavřený interval. |
| `lost_found_create`, `lost_found_update`, `lost_found_delete` | Založení, úprava podle aktuálního `updated_at` a smazání záznamu podle ID. |
| `lost_found_photo_add` | Přidání přiložené fotografie podle ID záznamu. Přijímá JPEG, PNG a WebP do 8 MiB. |
| `housekeeping_rooms_list`, `housekeeping_room_get` | Stránka pokojů nebo stav a blokace jednoho pokoje. Údaje o rezervacích až na vyžádání. |
| `housekeeping_room_status_set` | Změna stavu úklidu po kontrole původního stavu a ověření novým čtením. |
| `housekeeping_requirement_confirm`, `housekeeping_amenity_set` | Potvrzení požadavku doloženého rezervací nebo správa ruční ikony psa či postýlky. |
| `issue_list`, `issue_get`, `issue_photo_get` | Přehled závad, vybraný detail a odkaz na jeho fotografii. |
| `issue_create`, `issue_update`, `issue_delete`, `issue_photo_add` | Založení, úprava s kontrolou `updated_at`, smazání nebo příloha. Stávající limit jsou tři fotografie. |
| `inventory_items_list`, `inventory_item_get`, `inventory_item_activity` | Položky vybraného skladu, jednotka a množství nebo stránka historie. |
| `inventory_movements_list`, `inventory_movement_get`, `inventory_cards_list`, `inventory_card_get` | Stránkované pohyby a doklady. Řádky dokladu mají samostatný kurzor. |
| `inventory_pictogram_get`, `inventory_stocktake_pdf` | Vybraný piktogram nebo aktuální inventurní PDF v přihlášeném CML. |
| `inventory_item_create`, `inventory_item_update`, `inventory_item_delete`, `inventory_pictogram_set` | Parametry položky a obrázek. Množství existující položky se mění pohybem. |
| `inventory_movement_add`, `inventory_movement_delete`, `inventory_card_create`, `inventory_card_delete` | Účtování a stornování pohybů nebo úplného skladového dokladu. |
| `inventory_egg_order_submit`, `inventory_egg_order_latest`, `inventory_egg_order_status` | Odeslání objednávky 180 vajec přes Mail a stav původního ID. Další objednávka v ochranném okně používá původní potvrzovací postup. |
| `hotel_operation_get` | Účtenka podle původního `operation_id` a identity připojení. |

CML omezuje nástroje podle současného grantu konkrétního modulu.
Přímý MCP profil vlastníka používá samostatný účelový OAuth, PKCE a potvrzení
v CML. `breakfast:read` a `lost_found:read` vybírají čtecí katalogy.
`breakfast:write` a `lost_found:write` se schvalují výslovně pro příslušné
zápisy. Výchozí OAuth rozsah obsahuje čtení obou modulů. Podepsané CML pracuje
s aktuálním grantem modulu. Výchozí výpisy vracejí stručné položky a kurzor.
Úplný detail a soubor se vyžádají samostatně.

Pokojský profil používá `housekeeping:read` a `housekeeping:write`.
Závady používají `issues:read` a `issues:write`. Každý sklad má vlastní
`inventory_snidane:read` / `inventory_snidane:write` nebo
`inventory_drogerie:read` / `inventory_drogerie:write`. Katalog uvádí jen
povolené hodnoty parametru `warehouse`. Všechny operace s objednávkou vajec
vyžadují `inventory_snidane:write` jako ve webovém skladu.

Dynamická registrace bez uvedených rozsahů dovolí klientovi požádat o některý
z podporovaných rozsahů. Výchozí autorizační žádost získá jen čtení. Zápisy
vyžadují výslovnou žádost a následný souhlas v CML.

## Dopady

| Oblast | Kontrola a změna |
| --- | --- |
| API a autorizace | Přidat oficiální SDK transport, OAuth pro přesnou audience a rozhraní nad stávajícími dotazy. Ověřit modulový grant při výpisu i volání. |
| Stav | Přidat izolovanou migraci OAuth. Existující objednávky, nálezy, fotografie, účtenky a nativní přístupy zachovat. |
| Testy | Ověřit skutečný SDK na veřejné a podepsané cestě, PKCE, odvolání, oddělené role, nízký výchozí rozsah a zobrazení potvrzení. |
| UI a klienti | Přidat přístupovou obrazovku do stávajícího CML modulu. Ověřit stávající OpenAPI a nativní spotřebitele proti přesnému kontraktu. |
| Vydání a evidence | CI pro stejný SHA, výměna pouze API a jeho MCP trasy, kontrola aktivní verze, živé čtení a měření katalogu po profilech. |

Každý zápis vyžaduje `operation_id` ve formátu UUIDv4. Při opakování stejné
akce použij původní ID a vstup. Po chybě spojení čti účtenku podle původního
ID. Stav `uncertain` znamená, že účinek je potřeba ověřit čtením skutečných
dat. Zápisy ztrát a nálezů používají stávající frontu WhatsApp. Doručení
ověř stavem oznámení v detailu nálezu.
U vajec používá poštovní tok vlastní účtenku `inventory_egg_order_status`.
Při výsledku `confirm` se případné schválené opakování váže na
`previous_id` a vrácené `delivery_date`.
Osvětlení se řídí přes KájovoSmart. Běžná přejímka tohoto MCP nevyžaduje
fyzický povel ani odeslání zprávy.
