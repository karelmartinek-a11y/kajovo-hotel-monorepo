# Dostupnost pošty během hovoru

| Kategorie | Dopad |
|---|---|
| Produkční kód | Aktualizováno: sdílená synchronizace a úklid Mail MCP; Dagmar stav účtů a zotavení; hostový SDK log filtr |
| Testy | Doplněno: čekání vs. životnost synchronizace, souběh, síťové selhání/stop, částečnou dostupnost, obnovení stavu a zákaz replay mutací |
| CI/gates | Ověřeno beze změny: stávající úplné hotelové gates; samostatně build/test skutečného Mail MCP dist; žádné placené provider volání |
| Dokumentace/manifesty | Aktualizováno: voice-mail.md, observability.md, standalone Mail README a nový release manifest |
| Komentáře/poznámky | Aktualizováno: rozlišení timeoutu čekání a síťového timeoutu; žádné obsahové diagnostiky |
| Instrukce | Aktualizováno: provozní kontrakt v AGENTS.md; zachováno main-only a oddělené MCP služby |
| Fixtures/UI/text | Aktualizováno: syntetické mailbox/SDK fixtures; UI ověřeno beze změny: čte živý stav/účty bez nového API |
| Build/kontrakty/deploy | Ověřeno beze změny: nezměněné MCP schema/OpenAPI/klienta, skutečný hotelový image a Mail dist; cílené veřejné čtení bez SMTP/device mutace |

Čekání MCP požadavku je oddělené od jediného bounded sync jobu na účet.
MCP transport, IMAP/SMTP dostupnost a aktuálnost/úplnost indexu jsou oddělené.
Zotavení opakuje nanejvýš bezpečné čtení; mutace zachovávají původní identity.

Mail MCP je samostatný zdroj bez Git remote. Autoritativní nové vydání:
`/opt/kajovo-mail-mcp/releases/v1.0.2-20261006-86c0e3a26c96`,
`SOURCE.zip` SHA-256 `86c0e3a26c96503618a75ba032672decff11d4e41cf44213c9d011678dfdd0d8`.
Build manifest zaznamenává shodný opakovaný build, nezměněné dependencies a 54 PASS testů.
Runtime používá `/usr/bin/node /opt/kajovo-mail-mcp/dist/src/server.js`; všechny JS hashe
odpovídají manifestu nového vydání. Aktivace zachovala žurnály a chráněné konfigurace.
Důkazy na serveru: `/root/mail-availability-20261006/activation.json` a
`public-verification.json`. Veřejný endpoint z hotelového runtime ověřil initialize,
20 přesných nástrojů, účty a pouze čtení; obě schránky healthy a úplné výsledky.

Hotel má cíleně 91 PASS a celý Python test rozsah 627 PASS; místní plný gate má všech 29 kontrol PASS včetně responsive UI scénářů.
Main CI a standardní exact-SHA deploy zůstávají povinnou podmínkou aktivace hotelu.
OpenAPI, generovaný klient, veřejná MCP schémata a browser UI se nemění.
HA MCP a kontrolní MCP Kajovo jsou mimo dopad; jejich procesy a konfigurace byly
při aktivaci Mail ověřené beze změny. Reálný mikrofonní/provider hlasový hovor,
skutečné SMTP přijetí a doručení nejsou tímto read-only ověřením prokázané.
