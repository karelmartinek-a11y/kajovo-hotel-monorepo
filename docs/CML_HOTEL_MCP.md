# MCP KájovoHotelu

MCP zpřístupňuje snídaně a ztráty a nálezy podle oprávnění připojení.

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
| `hotel_operation_get` | Účtenka podle původního `operation_id` a identity připojení. |

CML omezuje nástroje podle současného grantu Snídaně nebo Ztráty a nálezy.
Přímý MCP profil vlastníka používá samostatný účelový OAuth, PKCE a potvrzení
v CML. `breakfast:read` a `lost_found:read` vybírají čtecí katalogy.
`breakfast:write` a `lost_found:write` se schvalují výslovně pro příslušné
zápisy. Výchozí OAuth rozsah obsahuje čtení obou modulů. Podepsané CML pracuje
s aktuálním grantem modulu. Výchozí výpisy vracejí stručné položky a kurzor.
Úplný detail a soubor se vyžádají samostatně.

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
Osvětlení se řídí přes KájovoSmart. Běžná přejímka tohoto MCP nevyžaduje
fyzický povel ani odeslání zprávy.
