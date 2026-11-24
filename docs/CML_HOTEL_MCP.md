# MCP KájovoHotelu

První vydání zpřístupňuje čtení snídaní a ztrát a nálezů. Zápisy a samostatné
moduly navazují nad stejnými pravidly Hotelu.

| Nástroj | Stávající chování, na které navazuje |
| --- | --- |
| `breakfast_day_get` | Souhrn za den a stránka objednávek z denního přehledu. |
| `breakfast_order_get` | Detail objednávky podle ID a verze, rezervace a diety na vyžádání. |
| `breakfast_daily_export` | PDF pro zvolený den přes přihlášený CML. |
| `lost_found_list` | Filtrovaný a stránkovaný přehled s ID a stavem. |
| `lost_found_get` | Vybraný záznam včetně popisu a metadat fotografií. |
| `lost_found_photo_get` | Odkaz na náhled nebo originál vybrané fotografie přes přihlášený CML. |

CML omezuje nástroje podle současného grantu Snídaně nebo Ztráty a nálezy.
Přímý MCP profil vlastníka používá samostatný účelový OAuth, PKCE a potvrzení
v CML. Rezervační a provozní údaje zůstávají v Hotel API. Výchozí výpisy vracejí
stručné položky. Úplný detail a soubor přicházejí až na vyžádání. Stránkování
neslouží jako potvrzení úplnosti zdrojových dat.

## Dopady

| Oblast | Kontrola a změna |
| --- | --- |
| API a autorizace | Přidat oficiální SDK transport, OAuth pro přesnou audience a rozhraní nad stávajícími dotazy. Ověřit modulový grant při výpisu i volání. |
| Stav | Přidat izolovanou migraci OAuth. Existující objednávky, nálezy, fotografie, účtenky a nativní přístupy zachovat. |
| Testy | Ověřit skutečný SDK na veřejné a podepsané cestě, PKCE, odvolání, oddělené role, nízký výchozí rozsah a zobrazení potvrzení. |
| UI a klienti | Přidat přístupovou obrazovku do stávajícího CML modulu. Ověřit stávající OpenAPI a nativní spotřebitele proti přesnému kontraktu. |
| Vydání a evidence | CI pro stejný SHA, výměna pouze API a jeho MCP trasy, kontrola aktivní verze, živé čtení a měření katalogu po profilech. |

Zápisy snídaní navazují na původní objednávku a verzi, diety na konkrétní
rezervaci. Zápisy ztrát a nálezů zachovávají původní pravidla a stávající
frontu WhatsApp. Přijetí frontou a doručení jsou oddělené výsledky.
Osvětlení se řídí přes KájovoSmart. Běžná přejímka tohoto MCP nevyžaduje
fyzický povel ani odeslání zprávy.
