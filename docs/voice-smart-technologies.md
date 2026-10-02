# Smart technologie v hotelovém hlasovém chatu

Administrátorský `/admin/hlasovy-chat` používá přenosný Voice Core pro WebRTC zvuk a hotelový backend pro jedinou funkci `smart_technologie`. Portál ani Android nemají hlasový přístup. Žádná hotelová komponenta nevolá Home Assistant přímo.

## Připojení a relace

Oficiální Python MCP SDK 1.30.0 používá Streamable HTTP, initialize a notifications/initialized na pevné veřejné adrese `https://apimcpkajavoiceha.hcasc.cz/mcp`. `KAJAVOICEHA_MCP_TOKEN` je backendový secret. HTTP klient nesleduje přesměrování. Compose jej předává pouze API; SSH deploy zachovává stávající serverový `.env`, používá umask 077 a vynucuje práva souboru 0600. Hodnota nepatří do zdrojů, browseru, modelových instrukcí ani logů.

API vytváří Realtime call, uchová jeho identitu z Location a otevře serverový WebSocket sideband. Browser dostane pouze SDP, veřejný stav a neprůhlednou identitu hostitelské relace. Během inicializace nevytváří VAD odpovědi a mikrofon se zpřístupní až po potvrzeném zprovoznění chatu. Stabilní heartbeat běží každých 15 sekund, úvodní readiness se kontroluje každou sekundu. Lease vyprší po 45 sekundách s kontrolou každých 5 sekund. Periodické požadavky neprodlužují webovou relaci.

Každé volání funkce znovu ověřuje databázovou administrátorskou relaci včetně revokace, neaktivity a aktivního účtu. Vlastník je ověřen také na status, heartbeat a ukončení. Všechny změnové HTTP endpointy zůstávají pod CSRF ochranou.

## Katalog a operace

Model dostane všechny řádky a všech osm polí včetně parametrických a názvových slovníků z živého MCP. Excel ani historický katalog není fallback. Identitou zařízení je jedničkový řádek spolu s revizí. `controls.function` používá první položku kompaktního pole konkrétní funkce; lidský název se skládá podle slovníků katalogu. Schéma parametrů i supported se kontrolují na backendu.

`catalog`, `read`, `control`, `operation_status` a `camera_view` jsou jedinými operacemi. Skupinový výsledek zachová také přeskočené a nedostupné řádky. Nejasný jednotlivý cíl vyžaduje upřesnění. Výsledky nejsou důkaz fyzického účinku.

Katalog je v jedné zprávě. Každá obnova čeká na potvrzené odstranění předchozí a potvrzené vložení celé nové tabulky. Během mezery je vykonávání zablokováno. Function output obsahuje jen metadata bez tabulky a bez base64. Realtime command errors a timeout potvrzení nejsou úspěch. Kamera používá potvrzený JPEG/PNG `input_image`; nepřijatý obraz se nepovažuje za prohlédnutý.

Technologie jsou podporovány pro ověřený `gpt-realtime-2.1`, s vypnutým automatickým truncation a stropem výstupu 4096. Ručně vybraný jiný model zůstává obyčejným hovorem. Nad 110000 vstupních tokenů backend odstraňuje staré dokončené položky; katalog a rozpracovaná volání zachovává. Při další kapacitní chybě nebo nedostatečném prostoru browser řízeně obnoví relaci a znovu načte celý katalog.

Výpadek MCP deaktivuje technologie; běžný rozhovor pokračuje. Nové zahájení hovoru znovu ověří MCP a načte katalog; nepotvrzené změny dohledává přes původní request_id. Porucha sidebandu vyžádá nový hovor, protože staré spojení nemůže bezpečně vykonávat funkce. Browser má původní omezený počet automatických pokusů o obnovu.

Provider `rate_limit_exceeded` pozastaví mikrofon a automatické odpovědi. Backend počká podle resetu z rate_limits.updated (nejméně 60 sekund, nejvýše 120 sekund) a nejvýše dvakrát obnoví pouze generaci z již potvrzených výsledků. MCP změnový povel znovu nevolá. Nedostatek kreditu nebo jiná neobnovitelná chyba zůstává chybou služby.

## Změnové požadavky

`voice_smart_operations` obsahuje pouze request_id, identitu vlastníka, provider call_id, hash argumentů, stav a čas. Request ID je stabilní SHA256 z identity hlasové relace a funkčního volání. Duplicitní požadavek zjišťuje stav původní operace. Po transportní nejistotě se změna neposílá znovu; při obnovení se model dozví identifikátory nepotvrzených operací stejného vlastníka. Metadata se odstraňují po 30 dnech. Přepisy, zvuk a kamerové obrázky se neukládají.

`queued`, `recording` a `record_accepted` popisují průběh požadavku na nahrávání. Neověřují vznik ani obsah videosouboru. Limity a retenci nahrávání vynucuje MCP server.

## Validace a produkční předání

Spustit `pnpm ci:voice-core`, `pnpm typecheck`, `pnpm unit`, generování a kontrolu kontraktu, build adminu a webu, copy-out, smoke a responzivní kontroly. CI musí importovat MCP, WebSocket i JSON Schema ve skutečném produkčním image. Izolované testy ověřují i nedostupnost, zakázané funkce, revize, deduplikaci, nejisté výsledky, potvrzování a image input.

Placená přejímka běží příkazem `python scripts/voice_smart_live_smoke.py` a vyžaduje explicitní `VOICE_CORE_LIVE_SMOKE=1` mimo CI, `VOICE_CORE_AUDIO_FIXTURE` se syntetickým WAV a `VOICE_CORE_BASE_URL` cílového hostu. Administrátorské přihlašovací údaje a MCP token se předávají pouze chráněným prostředím procesu. Produkční test smí ovládat pouze schválené světlo `0P0BSvetlo` a musí v finally obnovit původní stav. Živé hromadné ovládání ani nahrávání nejsou součástí této přejímky. Závěrečný protokol odděluje MCP stav, modelový výsledek, slyšitelný výstup, fyzické pozorování a nasazené SHA.

Při rollbacku použít předchozí ověřený release. Migrace přidává samostatnou tabulku a nemění existující data; token může zůstat v backendovém secret storage. Nedowngradovat databázi během běžného rollbacku aplikace.
