# Provozní logy a audit

Jediná HTTP access vrstva hotelu je hostový Nginx. `hotel_safe` zaznamená serverové
request ID, metodu, normalizovanou kategorii routy, HTTP stav, bytes a dobu trvání.
Nezaznamenává query, referer, opaque identity, cookie, credentials ani request body.
Úspěšné healthchecky, heartbeat, playback-ready a pravidelné hlasové polling routy
se vynechávají. Aplikační `request.completed` a Uvicorn access log jsou odstraněné.
Oba frontendové servery mají `access_log off` přímo v bloku `server`, takže
nezdědí access log základního nginx image. Dockerfiles tyto konfigurace kopírují
do výsledných image; frontendové error logy zůstávají zachované.

Hostový `/var/log/hotelapp/nginx_error.log` používá standardní úroveň `error`
v HTTP i HTTPS serveru: zaznamenává běžné upstream chyby i závažnější selhání,
bez debug režimu. Tento nativní error log **není sanitizovaný** a při chybě může
obsahovat URI, query i referer. Aktivní tokenové URL `/login/reset?token=…`
a `/api/auth/unlock?token=…&actor_type=…` zůstávají zachované; při chybě tedy
mohou do tohoto logu vstoupit citlivé údaje. Omezení access formátu `hotel_safe`
se na error log nevztahuje. Viz [nginx error_log](https://nginx.org/en/docs/ngx_core_module.html#error_log).

Python log zachovává start/stop služby, významné změny dostupnosti, neočekávané
chyby a bezpečnostní stavy 401/403/429. Hlasové chyby mají statický bezpečný kód,
komponentu, korelační ID a údaj retryable; logger nikdy nevypisuje provider/SQL
exception repr nebo traceback s daty. SDK transport chybám se nepřebírá raw text.
SDK INFO/DEBUG události mcp/httpx/httpcore/websockets se zahazují. Warning a error mají odlišné statické kategorie external.transport.warning / external.transport.failed; původní SDK zpráva, argumenty, exception a context se nepřebírají. Normalizace před potlačením opakování zabrání tomu, aby citlivý nebo proměnlivý payload vytvářel další logové klíče. Formatter omezuje délku i velikost contextu. Shodné warning/error opakování potlačí
po dobu 60 sekund s bounded 256-key indexem; další záznam uvede počet potlačených.
Úspěšné modelové odpovědi, audio chunky/delta, obsah tool výsledků a heartbeat nemají rutinní aplikační log. Ostatní hotelové logy zůstávají zachované.

AuditTrail rozhoduje podle významu routy a u memory `/operations` podle typu
operace. Technické hlasové `/calls`, `/sessions`, heartbeat a playback-ready nejsou
obchodní změny. Memory reads/search nejsou mutace; memory writes/settings, voice
config/api-key, skutečné hotelové změny a explicitní bezpečnostní routy audit mají.
Audit voice/chat nezahrnuje obsah, SDP nebo klíče. Existující bezpečné audit_detail
pro skutečné hotelové změny zůstávají. Audity se dokončí před návratem odpovědi;
worker vytvoří vlastní SessionLocal a provede commit/rollback/close mimo event loop.
DB chyba auditu se bezpečně zaznamená; zápis aplikace se kvůli ní automaticky neopakuje.

Docker json-file log má nejvýše 3 soubory po 10 MB na službu. Hostové hotelové logy
rotuje `/etc/logrotate.d/kajovo-hotelapp` z `infra/ops/logrotate-hotelapp.conf`:
denně, maxsize 10 MB, sedm rotací s kompresí. Hostový logrotate timer omezení
vyhodnocuje při běhu; maxsize není hard cap mezi běhy. Deploy ověří shodu konfigurace
bez rozšíření sudo oprávnění. Historický hlasový archiv má samostatný offline režim
podle [docs/dagmar/DIAGNOSTICS.md](dagmar/DIAGNOSTICS.md).

## Ověření nginx logování a matice dopadů

`scripts/verify_voice_core_proxy.py` v existujícím CI jobu `api-runtime-image`
ověřuje sestavené frontendové image přes `nginx -t` a `nginx -T`, serverový scope
vypnutí access logu, skutečné stránky a assety s neškodnými query/referer markery,
nulové frontendové access zápisy a strukturu hostových access řádků. Úspěšné
healthchecky nezapisují access log. Samostatný izolovaný nginx server používá
stejnou produkční mapu pro test úspěšných heartbeatů/pollingu i jejich chyb.
Zastavení pouze izolovaného API musí vyvolat 502 a standardní upstream error
včetně syntetického URI/query/refereru; produkční API se tímto testem nevypíná.
Routování a bezpečnostní hlavičky zůstávají součástí kontroly.

| Kategorie | Rozhodnutí a rozsah |
| --- | --- |
| 1. Produkční zdroj | Aktualizovat tři aktivní nginx konfigurace; hlasový kód a audit ověřit beze změny. |
| 2. Testy | Aktualizovat existující Docker/proxy kontrolu; celý release gate ověřit beze změny. UI se nemění, vizuální sady nejsou relevantní. |
| 3. Actions a gates | Ověřit beze změny: CI již sestavuje skutečné image a spouští proxy kontrolu; exact-SHA CI podmiňuje deploy. |
| 4. Dokumentace | Aktualizovat tento provozní kontrakt a reverse-proxy README; veřejná schémata a manifesty se nemění. |
| 5. Komentáře a poznámky | Aktualizovat popis izolované kontroly; ostatní komentáře ověřit beze změny. |
| 6. Instrukce | Aktualizovat kořenový AGENTS.md pro serverové vypnutí access logu a nesanitizovaný error log. |
| 7. Fixtures a texty | Aktualizovat syntetické markery a izolované statusové scénáře v proxy kontrole; selektory, překlady a uživatelské texty nejsou relevantní. |
| 8. Build a deploy | Ověřit beze změny Docker COPY, synchronizaci hostové konfigurace, retenci a produkční assety; OpenAPI a generovaný klient nemají změnu kontraktu. |
