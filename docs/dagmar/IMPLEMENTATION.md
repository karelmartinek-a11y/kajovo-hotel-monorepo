# Aktivní implementace Dagmar

Celý produkt je v `packages/dagmar-server` a `packages/dagmar-browser`, nad
přenosným `packages/voice-core` a `packages/voice-core-server`. Hotel dodává
aktuální autentizaci/revokaci, technickou databázi, chráněné provider/MCP klíče,
routing a release metadata. `examples/dagmar-host` je izolovaný loopback host
s testovací autentizací; není další produkční login.

Browser `LogicalCallClient` zahájí lokální generaci explicitním Start. Mikrofon
se získá z uživatelského gesta; až SDP handshake vytvoří vlastnicky autorizovaný
LogicalCall přes `/calls`. Reconnecty používají tutéž identitu. Stop uzavře call
přes `/calls/{identity}/close` a provider session nezávisle na uvolnění médií.
Pozdní odpověď po Stop uzavře původní call a nemůže přepsat novější Start.
Neznámý výsledek zápisu se automaticky neopakuje.

Server ověřuje vlastníka, otevřenost LogicalCall a autentizovanou session.
Kontext logického hovoru zůstává v RAM se zachováním úplných function/output párů,
originálních request ID a journalů. Greeting je rezervován atomicky v databázi;
playback-ready ani reconnect nesmí vytvořit duplicitní pozdrav. Forget vymaže
aktivní i odpojené úlohy; privacy pause přežije reconnect.

Realtime zachovává skutečné WebRTC audio, native VAD/barge-in, mute, Stop,
connection timeout, bounded reconnect a heartbeat lease. Playback neblokuje input.
Hlasový orb používá AudioContext analysers a requestAnimationFrame pro živou úroveň.
MCP, paměť a výpadek externí schopnosti nemění generickou connection readiness.

Sdílená paměť a HA MCP zachovávají dosavadní funkční endpointy,
idempotenci, trvalé výsledky a audio potvrzení. Odeslaná/nejistá mutace se obnovuje
pouze s původním request/operation ID; nic se neopakuje kvůli logování.
Provozní diagnostika je odstraněná. Historický archiv se čte samostatně podle
[DIAGNOSTICS.md](DIAGNOSTICS.md). [ROLLBACK.md](ROLLBACK.md) chrání živá data.

Úplný `pnpm ci:gates` ověřuje Python/API testy, browser lifecycle, skutečné
HTTP/auth/databázové toky na třech viewportech, shared kontrakty, buildy a izolovaný
copy-out bez hotelových zdrojů. Runtime image gate kontroluje funkční routy a
absenci diagnostického API. Placené provider volání a skutečné MCP mutace nepatří do CI.

Historické protokoly v `evidence/` jsou záznamy starších SHA. Nejsou aktivními
požadavky na nahrávání ani důkazem akustické kvality současného vydání.
Aktuální změna a měření jsou v [matici odstranění](../voice-diagnostics-removal.md).
