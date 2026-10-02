# Smart technologie v hotelovém hlasovém chatu

Administrátorský `/admin/hlasovy-chat` používá přenosný Voice Core pro WebRTC zvuk a hotelový backend pro jedinou funkci `smart_technologie`. Portál ani Android nemají hlasový přístup. Žádná hotelová komponenta nevolá Home Assistant přímo.

## Připojení a relace

Oficiální Python MCP SDK 1.30.0 používá Streamable HTTP, initialize a notifications/initialized na pevné veřejné adrese `https://apimcpkajavoiceha.hcasc.cz/mcp`. `KAJAVOICEHA_MCP_TOKEN` je backendový secret. HTTP klient nesleduje přesměrování. Compose jej předává pouze API; SSH deploy zachovává stávající serverový `.env`, používá umask 077 a vynucuje práva souboru 0600. Hodnota nepatří do zdrojů, browseru, modelových instrukcí ani logů.

API vytváří Realtime call, uchová jeho identitu z Location a otevře serverový WebSocket sideband. Browser dostane pouze SDP, veřejný stav a neprůhlednou identitu hostitelské relace. Během inicializace nevytváří VAD odpovědi a mikrofon se zpřístupní až po potvrzeném zprovoznění chatu. Stabilní heartbeat běží každých 15 sekund, úvodní readiness se kontroluje každou sekundu. Lease vyprší po 45 sekundách s kontrolou každých 5 sekund. Periodické požadavky neprodlužují webovou relaci.

Každé volání funkce znovu ověřuje databázovou administrátorskou relaci včetně revokace, neaktivity a aktivního účtu. Vlastník je ověřen také na status, heartbeat a ukončení. Všechny změnové HTTP endpointy zůstávají pod CSRF ochranou.

## Katalog a operace

Každý MCP požadavek obsahuje `api_version:2` a backendem určené `session_id`. Model tyto hodnoty nemůže změnit. Úvodní `catalog` vrací krátký přehled 199 schválených zařízení; celý katalog zůstává na MCP. `search` hledá fulltextem a filtry jména, umístění, druhu, funkce a skutečných schopností. Stav se čte pouze na výslovný dotaz přes `read` nebo `filters.state`.

Operace jsou `catalog`, `search`, `describe`, `read`, `control`, `operation_status`, `camera_view`. Search vrací až 200 názvů na stránku a `total`/`has_more`; vyjmenování všech shod vyžaduje potřebné stránky. `selection.id` pokrývá všechny shody, je izolovaný podle klienta a hlasové relace a platí 30 minut. Hromadná akce používá celý výběr. Prázdný dotaz nesmí vést k ovládání všech zařízení bez výslovného pokynu. Nejasný jednotlivý cíl vyžaduje upřesnění.

Describe/read vrací až osm zařízení. `devices[i]` náleží globálnímu `rows[i]`, nikoli i+1. Osm schválených polí a jejich slovníky se zachovávají beze změny. Explicitní řádky vyžadují revizi; výběr se nekombinuje s rows/controls. Konkrétní funkce a parametry validuje MCP podle schváleného katalogu. Pro hlavní komponentu lze použít `action`; pro další funkce model nejprve načte describe. Při změně revize nebo expiraci se znovu hledá.

Backend uchovává jednu malou pracovní zprávu `kvha_` s aktuálním výsledkem, posledním hledáním, celým výběrem a posledním explicitním cílem. Potvrzené odstranění předchozí zprávy předchází potvrzenému vložení nové. Function output obsahuje metadata bez duplicitních tabulek a base64. Interní kontext používá systémovou roli, proto se nezobrazuje jako lidský výrok. Kamera používá skutečný potvrzený JPEG/PNG `input_image`; před dalším snímkem se potvrzeně odstraní staré obrazové položky. Nepřijatý obraz se nepovažuje za prohlédnutý.

`accepted` znamená pouze „Pokyn byl odeslán.“ Backend ani model automaticky nečtou stav po povelu a netvrdí fyzické provedení. Skupinový výsledek zachovává počty i výjimky, včetně nedostupných a nepodporovaných cílů. Nejistý výsledek se dohledává pomocí původního request_id, nikdy novým povelem. Přerušení řeči neruší již odeslaný požadavek.

Technologie používají `gpt-realtime-2.1`, vypnuté automatické truncation a strop výstupu 4096. Jiný ručně zvolený model zůstává obyčejným hovorem. Nad 110000 vstupních tokenů backend odstraňuje staré dokončené položky; aktuální kontext a rozpracovaná volání zachovává. Při další kapacitní chybě browser řízeně obnoví relaci s novým přehledem a identitami nevyřešených povelů.

Výpadek MCP deaktivuje technologie; běžný rozhovor pokračuje. Nové zahájení hovoru znovu ověří MCP a načte katalog; nepotvrzené změny dohledává přes původní request_id. Porucha sidebandu vyžádá nový hovor, protože staré spojení nemůže bezpečně vykonávat funkce. Browser má původní omezený počet automatických pokusů o obnovu.

Provider `rate_limit_exceeded` pozastaví mikrofon a automatické odpovědi. Backend počká podle resetu z rate_limits.updated (nejméně 60 sekund, nejvýše 120 sekund) a nejvýše dvakrát obnoví pouze generaci z již potvrzených výsledků. MCP změnový povel znovu nevolá. Nedostatek kreditu nebo jiná neobnovitelná chyba zůstává chybou služby.

## Změnové požadavky

`voice_smart_operations` obsahuje pouze request_id, identitu vlastníka, provider call_id, hash argumentů, stav a čas. Request ID je stabilní SHA256 z identity hlasové relace a funkčního volání. Duplicitní požadavek zjišťuje stav původní operace. Po transportní nejistotě se změna neposílá znovu; při obnovení se model dozví identifikátory nepotvrzených operací stejného vlastníka. `voice_smart_deliveries` trvale eviduje hash argumentů a potvrzení doručení každého function output. Identita hlasové relace vychází z autentizovaného vlastníka a provider call_id; opakovaný event po restartu neodesílá povel ani výstup znovu. Nepotvrzené doručení vyžaduje obnovu hovoru a dohledání původních nevyřešených povelů. Metadata obou tabulek se odstraňují po 30 dnech. Přepisy, zvuk a kamerové obrázky se neukládají.

`queued`, `recording` a `record_accepted` popisují průběh požadavku na nahrávání. Neověřují vznik ani obsah videosouboru. Limity a retenci nahrávání vynucuje MCP server.

## Validace a produkční předání

Spustit `pnpm ci:voice-core`, `pnpm typecheck`, `pnpm unit`, generování a kontrolu kontraktu, build adminu a webu, copy-out, smoke a responzivní kontroly. CI musí importovat MCP, WebSocket i JSON Schema ve skutečném produkčním image. Izolované testy ověřují i nedostupnost, zakázané funkce, revize, deduplikaci, nejisté výsledky, potvrzování a image input.

Placená přejímka běží příkazem `python scripts/voice_smart_live_smoke.py` a vyžaduje explicitní `VOICE_CORE_LIVE_SMOKE=1` mimo CI, `VOICE_CORE_AUDIO_FIXTURE` se syntetickým WAV a `VOICE_CORE_BASE_URL` cílového hostu. Administrátorské přihlašovací údaje a MCP token se předávají pouze chráněným prostředím procesu. Produkční test smí ovládat pouze schválené světlo `0P0BSvetlo` a musí v finally obnovit původní stav. Živé hromadné ovládání ani nahrávání nejsou součástí této přejímky. Závěrečný protokol odděluje MCP stav, modelový výsledek, slyšitelný výstup, fyzické pozorování a nasazené SHA.

Při rollbacku použít předchozí ověřený release. Migrace přidávají samostatné tabulky a nemění existující data; token může zůstat v backendovém secret storage. Nedowngradovat databázi během běžného rollbacku aplikace.

Matice dopadů: [MCP v2](voice-smart-impact-matrix.md).
