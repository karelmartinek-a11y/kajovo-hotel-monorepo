# KajaVoiceHA: napojení hlasového chatu

Tato příručka popisuje rozhraní. Aktuální výsledek produkčních kontrol a termín platnosti konkrétního tokenu jsou v samostatném předávacím protokolu; samotná existence této příručky nepotvrzuje nasazení.

## Připojení a tajné údaje

- MCP endpoint: `https://apimcpkajavoiceha.hcasc.cz/mcp`.
- Přenos: MCP Streamable HTTP, JSON-RPC 2.0. Použijte oficiální MCP SDK a jeho inicializaci; `/mcp` není běžné REST API.
- Každý požadavek má `Authorization: Bearer <token>`. Jde o oddělený token klienta KajaVoiceHA. Platnost prvního klientského tokenu je 365 dní; skutečné datum expirace je v soukromém předávacím souboru.
- Token patří pouze do backendu aplikace. Neposílejte jej do browseru, WebRTC data channelu, instrukcí modelu, Excelu, Git repozitáře ani logů. Nezadávejte jej do URL.
- I aplikace na produkčním serveru volá tuto veřejnou HTTPS adresu. Nedostane interní port ani přístup k Unix socketu služby. HTTPS požadavek na `127.0.0.1` nebo privátní cílovou adresu bude odmítnut, i při změně Host/SNI.
- `GET /healthz` vyžaduje stejnou autorizaci. Odpověď slouží kontrole připravenosti, ne seznamu zařízení.

Vlastník vyzvedne schválený předávací soubor například příkazem `scp produkce:/root/kajavoiceha-handoff/pripojeni-voice-chat-01.env ./pripojeni-voice-chat-01.env` a nastaví místně `chmod 600 ./pripojeni-voice-chat-01.env`. Skutečnou hodnotu tokenu předá programátorovi soukromým kanálem. Příručka ani příklady ji neobsahují. Každý další hlasový chat dostane vlastní klientský token, aby šel odvolat samostatně.

## Jediná hlasová funkce a katalog

Hlasový model má jednu funkci `smart_technologie`. První operace `catalog` vrátí celý schválený katalog. Žádné stránky zařízení se nemusí dotahovat: model dostane všechny řádky. Katalog je jediný zdroj pro názvy, umístění, dostupné možnosti ovládání a čtení. Typ zařízení nikdy neopravňuje k domýšlení dalších funkcí.

Odpověď obsahuje `fields` s osmi položkami `{key,label}` a `devices` jako pole osmiprvkových řádků. Jde výhradně o uživatelem schválené sloupce A, B, D, E, F, G, H, I. Zařízení označená k ignorování v katalogu nejsou. Hlasovému modelu se neposílají interní registry, názvy integrací, backendové adresy ani interní identifikátory.

`catalog_revision` identifikuje přesnou verzi katalogu. Reference zařízení je jeho **jedničkový index** v `devices`: řádek `1` je `devices[0]`. Index se posílá v argumentech funkce; není devátým sloupcem. Model musí používat současně správnou revizi. Při změně katalogu se nejprve načte celý nový katalog a obnoví reference.

Hlasový model hledá napříč všemi schválenými poli, také podle konkrétních vlastností a funkcí. Například „všechna barevná světla v recepci“ vybírá podle skutečných funkcí jednotlivých řádků, nikoli pouze podle druhu světla. Vyjmenování všech odpovídajících názvů nesmí končit prvním nálezem. Dvě zařízení mohou mít stejný název; při nejasném jednotlivém povelu použije model umístění a upřesní zadání. Explicitní skupinový povel zahrne všechny odpovídající řádky.

### Argumenty `smart_technologie`

| Pole | Význam |
| --- | --- |
| `operation` | `catalog`, `read`, `control`, `operation_status`, `camera_view` |
| `catalog_revision` | Revize získaná z `catalog`; povinná pro práci s řádky. |
| `rows` | Jedničkové indexy zařízení pro čtení a případné získání obrazu. |
| `controls` | `{row, function, parameters?}`; `function` musí přesně odpovídat povolené funkci konkrétního řádku. |
| `request_id` | Identifikátor změny. U `control` jej backend vygeneruje stabilně pro konkrétní hlasové volání; `operation_status` použije identifikátor vrácený předchozí operací. |

Příklad prvního volání: `{"operation":"catalog"}`. Poté `{"operation":"read","catalog_revision":"REVIZE_Z_ODPOVEDI","rows":[1,2]}`. Příklad řízení je vždy potřeba sestavit z reálného katalogu: název funkce ani její parametry se nepředpokládají.

Odpověď MCP má jeden blok `TextContent`, který obsahuje JSON s `catalog_revision`, `observed_at`, `fields`, `devices`, `results` a případným `operation`. Text se parsuje jednou; nevkládá se zároveň duplicitní `structuredContent`. Každý výsledek má `row`, `status` a případně neutrální `message` či `function`.

Ve vnořeném poli ovládání jsou jednotlivé funkce kompaktní pole `[function,component_ref,action_ref,parameters_ref,supported,unavailable_reason]`; pořadí je vždy popsáno `fields[3].item_fields`. Slovníky `fields[3].component_names`, `action_names` a `parameter_definitions` obsahují všechna použitá jména komponent, jména akcí a úplná JSON schémata parametrů. Název funkce vznikne spojením jména komponenty a akce pomocí `fields[3].label_separator` (`": "`); prázdná `component_ref` znamená samotné jméno akce. Nepodporovaná funkce má `supported:false`; výchozí vysvětlení může být v `fields[3].unsupported_default`.

Čitelné vlastnosti mají pořadí `[function,component_ref,reading_ref,unit]` podle `fields[4].item_fields`. Jméno vlastnosti se dohledá v `fields[4].reading_names` a jméno komponenty opět v `fields[3].component_names`. Aktuální hodnoty mají `[function,value]` podle `fields[5].item_fields`, přičemž název a jednotka se dohledají mezi čitelnými vlastnostmi téhož řádku. Možné stavy jsou `[component_ref,states_ref]` podle `fields[6].item_fields`; jejich úplná definice je ve `fields[6].state_definitions`, jméno komponenty stále v `fields[3].component_names`. Všechny definice jsou v téže odpovědi spolu s celými osmi sloupci všech řádků: nejde o externí lookup ani ztrátu informace. Nezaměňujte tento kompaktní popis s argumentem `controls`, který nadále obsahuje objekty `{row,function,parameters}`.

Aktuální stav a dostupnost se ověřují při volání. Nedostupná zařízení se při skupinovém povelu přeskočí; ostatní dostupná a způsobilá zařízení povel provedou. Model řekne, co proběhlo a co se přeskočilo. Nedostupnost, nepovolená funkce a nejasný výsledek nejsou úspěch. Při přerušeném spojení neopakujte změnový povel s novým `request_id`: nejdříve zjistěte `operation_status` původního požadavku. Nevratný povel se nesmí automaticky opakovat po nejasném výsledku.

Povolené nahrávání kamery je změnová funkce konkrétního řádku. Běží na pozadí s délkou 30 sekund bez explicitního parametru, nejvýše 300 sekund a s lookback nejvýše 30 sekund. Výsledky `queued`, `recording` a `record_accepted` rozlišují čekání, probíhající požadavek a přijetí backendem; `uncertain` označuje nejasný výsledek. Služba nezávisle neověřuje vznik ani obsah videosouboru, proto `record_accepted` nesmí hlasový chat prezentovat jako prokazatelně hotový záznam. `operation_status` sleduje tyto stavy. Záznamy jsou soukromé a nejsou veřejným videostreamem ani součástí katalogu. Hodinový cleanup uplatňuje retenci 24 hodin a rozpočet 512 MB s tolerancí do příštího běhu; aktivní soubor se nemaže, takže rozpočet není okamžitý tvrdý limit.

## Zapojení do OpenAI Realtime

Soubor [voice-bridge.ts](voice-bridge.ts) ukazuje backendový adaptér: MCP klient se připojí přes veřejnou adresu, načte katalog, poskytne jednu hlasovou funkci a vrací její výsledek do aktuální Realtime konverzace. Není propojený s interními moduly stávajícího hotelového Voice Core. Hostitelská aplikace zajišťuje přihlášení uživatele, relaci a bezpečné doručení function-call událostí na backend.

Katalog vložte do konverzace před prvním uživatelským řízením zařízení. Použijte model, který podporuje použité funkce a případné obrázky. Plný katalog se ukládá jen jednou; výsledky jednotlivých akcí jej nenahrazují dalšími duplikáty. Při obnovení relace jej znovu bezpečně načtěte a předložte modelu.

Adaptér si drží ID aktuální katalogové zprávy. Při aktualizaci ji odstraní pomocí `conversation.item.delete` a vloží celou novou tabulku; do `function_call_output` dává pouze metadata výsledku. V kontextu tak nezůstávají současně různé úplné kopie. Callback pro zápis Realtime událostí musí čekat na potvrzení přijetí poskytovatelem a odmítnout Promise při chybě; samotné zavolání `dataChannel.send()` potvrzení nezajišťuje. Aktualizace tabulky v jedné relaci serializujte.

Při `camera_view` může MCP přidat blok `ImageContent` JPEG/PNG. Backend jej převede na Realtime zprávu `conversation.item.create` s `content:[{type:"input_image",image_url:"data:<mime>;base64,..."}]`. Do `function_call_output` vrací pouze veřejná metadata, včetně času načtení; base64 se nesmí převést na obyčejný text pro model. Teprve pak se odešle `response.create`. Pokud použitý hlasový model obrazy nepřijímá, backend operaci obrazového vstupu nepovažuje za dokončené prohlédnutí a vrátí uživateli jasnou informaci o omezení.

Most v příkladu používá oficiální balíček `@modelcontextprotocol/sdk`. Verzi balíčku uzamkněte v lockfile své aplikace a ověřte ji proti nasazené verzi serveru. Aktuální SDK provede `initialize`, `notifications/initialized` a přenáší do dalších požadavků dohodnutou verzi protokolu; tyto kroky nevynechávejte.

## Co ověřit před zapnutím hlasového chatu

Ověřte platný HTTPS certifikát, odmítnutí chybějícího nebo cizího tokenu, inicializaci SDK, načtení úplného katalogu, hledání podle funkcí, vyjmenování více shod, čtení živého stavu, povolené řízení a odmítnutí nepovolené funkce. Skupinový test musí prokázat přeskočení nedostupného zařízení. Opakování stejného `request_id` nesmí provést změnu podruhé. Obrazový test musí skončit `input_image`, nikoli textem obsahujícím base64. Zkontrolujte také veřejnou cestu z backendu na stejném produkčním serveru a odmítnutí loopback/private cílové adresy.

## Primární dokumentace

- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Oficiální TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [OpenAI Realtime function calling](https://developers.openai.com/api/docs/guides/realtime-conversations#function-calling)
- [OpenAI Realtime image inputs](https://developers.openai.com/api/docs/guides/realtime-conversations#image-inputs)

## Velikost kontextu hlasové relace

Úplná tabulka199×8 po bezztrátovém sdílení definic měla při ověřování dne2.10.2026 velikost189882B a78922tokenů podle `o200k_base`; aktuální čtené hodnoty mohou velikost změnit. Použijte obrazově kompatibilní Realtime model s kontextem alespoň128000tokenů, například `gpt-realtime-2.1`, a `max_output_tokens:4096`, aby zůstal prostor pro dialog i obraz. Počet je měření textového katalogu, nikoli potvrzení spotřeby skutečného poskytovatele.

Hostitelský backend musí uchovat celý katalog i při správě dlouhé historie. Nastavte `truncation:"disabled"`, sledujte vstupní rozpočet a před jeho vyčerpáním řízeně zkraťte staré položky dialogu nebo obnovte relaci se stejným úplným katalogem. Nevypouštějte zařízení ani slovníky a nepovolte automatické odstranění katalogové zprávy. Při chybě kontextu nesmí model dál ovládat zařízení s chybějícím zdrojem pravdy. [Kontext a modality modelu](https://developers.openai.com/api/docs/models/gpt-realtime-2.1).
