# KajaVoiceHA: izolované nasazení a návrat

Služba se nasazuje nezávisle na hotelových kontejnerech, databázích a virtualizovaném backendu. Nasazovací skripty se spouštějí jako root až po schválení změny a úspěšné CI. Účet `root` může obejít lokální ACL; veřejná cesta je vynucena vůči běžným aplikacím, ne vůči správci operačního systému.

## Předpoklady

Server má veřejnou IPv4 `89.221.222.92`, IPv6 `2a02:2b88:2:b5c::1`, nginx, systemd 255 a Python 3.12. Go sestavení proběhne mimo produkci: `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o kajavoiceha ./cmd/kajavoiceha`. Výsledkem je jeden binární soubor bez instalace Go runtime na serveru. Použijte verzi toolchainu a modulů uzamknutou v projektu.

DNS původně zdědilo wildcard A/AAAA. AAAA ukazuje na `2a02:2b88:2:b5c::`, která na serveru není přiřazená. **Neměnit globální wildcard ani ostatní domény.** Doporučená oprava je vytvořit explicitní A záznam `apimcpkajavoiceha` na `89.221.222.92`; tím konkrétní DNS jméno přestane dědit wildcard AAAA. Alternativou je explicitní funkční AAAA pouze tohoto jména na `2a02:2b88:2:b5c::1`. Před vydáním certifikátu ověřte výsledky DNS zvenčí, včetně toho, že není publikována nefunkční IPv6.

Existující backendový token `/etc/hotel-smart-technologies/ha-token` se nemění ani nekopíruje do souboru pro hlasový chat. Je root `0600` a systemd jej dodá službě přes `LoadCredential`. Služba čte síťově pouze backend `192.168.124.10`; systemd síťové omezení tomu odpovídá.

## Postup

1. Přenést ověřený binární soubor, interní `catalog.json` a adresář `deploy/` do soukromého staging prostoru. `install.sh BINARY CATALOG_JSON RELEASE_SHA` založí samostatný účet a neměnný release `/opt/kajavoiceha/releases/<SHA>`. Nerestartuje služby ani nginx.
2. Spustit `python3 deploy/generate-client.py`. Vytvoří 256bitový klientský token se 365denní platností. Skutečný token je pouze v `/root/kajavoiceha-handoff/pripojeni-voice-chat-01.env` (`0600`, adresář `0700`); `/etc/kajavoiceha/clients.json` obsahuje SHA-256 hash, identifikátor, expiraci a příznak odvolání.
3. `activate-release.sh RELEASE_SHA` atomicky přepne `current`, nainstaluje vlastní unit, načte systemd konfiguraci a restartuje pouze `kajavoiceha.service`. Poté čeká nejvýše 20 sekund na autorizovanou JSON odpověď readiness. Předchozí release zůstane dostupný jako `previous`. Katalog je navázaný na stejný ukazatel jako binární soubor. Privilegovaná instalační sonda jako root kontroluje Unix socket; běžné aplikace na něj přístup nedostanou a závěrečné přejímací testy běží výhradně přes veřejné HTTPS. Po rotaci lze pro sondu předat konkrétní rootový soubor v `KAJA_READINESS_CREDENTIAL`.
4. Přidat jen vlastní ACME vhost z `nginx-acme.conf`, vytvořit challenge webroot `/var/lib/kajavoiceha-acme`, provést `nginx -t` a graceful reload. Po správném DNS vydat samostatný certifikát pro `apimcpkajavoiceha.hcasc.cz` pomocí webroot challenge. Nesahat na lineage ostatních domén.
5. Nahradit vlastní ACME vhost plnou konfigurací `nginx.conf`. Znovu `nginx -t` a graceful reload. Certifikát musí mít automatickou obnovu přes existující Certbot timer a reload nginx po úspěšné obnově.
6. Provést veřejné acceptance testy z externího klienta i z cohostované aplikace. Samotný `systemctl is-active` nestačí k uzavření nasazení.

Unix socket `/run/kajavoiceha/mcp.sock` má být vlastněn `kajavoiceha:www-data` s režimem `0660`, adresář `0750`. Není zveřejněn TCP port služby ani mount socketu do aplikací. Nginx odmítne request mířící na loopback nebo privátní adresu bez ohledu na Host. Platná veřejná URL ze stejného hostu může být routována místně jádrem; používá však stejný HTTPS ingress a autorizaci.

## Limity a pozorování

Unit má `MemoryHigh=192M`, `MemoryMax=256M`, `CPUQuota=50%`, izolovaný stavový adresář a read-only systém souborů. Obrazové odpovědi se neukládají do nginx cache nebo proxy temp souborů. Access log obsahuje metodu, cestu, status a velikost; nezahrnuje Authorization, query string, JSON tělo, token, obraz ani hlasový přepis.

Schválené nahrávání kamer běží na pozadí, nejvýše jedno současně, s frontou nejvýše 20 úloh. Výchozí délka je 30 sekund, maximum 300 sekund, lookback nejvýše 30 sekund. Stav je `queued`, `recording`, `record_accepted` či `uncertain`. `record_accepted` potvrzuje přijetí požadavku backendem; soubor a jeho obsah nejsou nezávisle ověřeny, proto se přijetí nesmí hlásit jako prokazatelně hotový záznam. Názvy souborů ani interní cesty se hlasovému chatu nevracejí.

Záznamy jsou pouze v soukromém `/media/kajavoiceha` (`0700`) uvnitř běžícího backendu. Instalační helper vytvoří pouze tuto složku přes existující QEMU guest agent. Hodinový timer maže výhradně běžné soubory s názvem UUIDv4 `.mp4` v této složce, po 24 hodinách nebo od nejstarších při překročení 512 MB. Retence má toleranci do příštího hodinového běhu a jeho zpoždění. Symbolické odkazy a jakékoliv jiné soubory ignoruje. Soubor změněný v posledních 10 minutách se kvůli probíhajícímu zápisu nemaže; případné dočasné překročení rozpočtu se nahlásí a dořeší při dalším běhu po dokončení záznamu. Rozpočet není tvrdým okamžitým limitem. Neprochází ani nemaže ostatní media.

Journal operací `/var/lib/kajavoiceha/journal.json` je soukromý a musí přetrvat restart; nemaže se při release. Nejasný výsledek řízení se řeší zjištěním původního `request_id`, nikoli novým spuštěním povelu. Monitorujte autorizovaný `/healthz`, restarty služby, memory pressure, nginx 5xx a obnovu certifikátu. Neprohlašujte testování všech ovládacích funkcí za hotové, pokud se pouze ověřilo jejich API schéma.

## Návrat a správa tokenů

Pro návrat přepnout `current` na zachovaný předchozí release pomocí `activate-release.sh <předchozí-SHA>`. Tím se zároveň vrátí jeho katalog a unit. Vypnutí funkce znamená zastavit jen `kajavoiceha.service` a deaktivovat jen její nginx vhost; po `nginx -t` následuje graceful reload. Journal ani tokeny se automaticky nemažou. Hotel, Dagmar a backend se nerestartují.

Další klient: `generate-client.py --client-id voice-druhy --handoff-name pripojeni-voice-chat-02.env`, poté restart pouze MCP služby. Pro odvolání nastavit konkrétnímu klientovi v rootovém `clients.json` `revoked:true` a restartovat MCP službu. Rotace vytváří novou identitu a nový token; nesmí přepsat předávací soubor stávajícího klienta.
