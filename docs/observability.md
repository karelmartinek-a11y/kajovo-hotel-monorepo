# Provozní logy a audit

Jediná HTTP access vrstva hotelu je hostový Nginx. `hotel_safe` zaznamená serverové
request ID, metodu, normalizovanou kategorii routy, HTTP stav, bytes a dobu trvání.
Nezaznamenává query, opaque identity, cookie, credentials ani request body.
Úspěšné healthchecky, heartbeat, playback-ready a pravidelné hlasové polling routy
se vynechávají. Aplikační `request.completed` a Uvicorn access log jsou odstraněné.
Nginx per-request error duplicity nahrazují bezpečné HTTP statusy; kritické chyby
serveru zůstávají v jeho error logu.

Python log zachovává start/stop služby, významné změny dostupnosti, neočekávané
chyby a bezpečnostní stavy 401/403/429. Hlasové chyby mají statický bezpečný kód,
komponentu, korelační ID a údaj retryable; logger nikdy nevypisuje provider/SQL
exception repr nebo traceback s daty. SDK transport chybám se nepřebírá raw text.
Formatter omezuje délku i velikost contextu. Shodné warning/error opakování potlačí
po dobu 60 sekund s bounded 256-key indexem; další záznam uvede počet potlačených.
Úspěšné modelové odpovědi, audio chunky/delta, mail tool výsledky a heartbeat
nemají rutinní aplikační log. Ostatní hotelové logy zůstávají zachované.

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
