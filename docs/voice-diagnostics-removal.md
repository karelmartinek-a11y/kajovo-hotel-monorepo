# Hlasový chat bez provozní diagnostiky

## Matice dopadů

| Kategorie | Rozhodnutí | Rozsah |
|---|---|---|
| Produkční zdroj | aktualizovat / odstranit | Funkční LogicalCall; odstranit browser capture, collectory, diagnostické API a úložiště z aplikace; významový audit a bezpečné logy. |
| Testy | aktualizovat / odstranit | Zachovat lifecycle, reconnect, VAD, paměť, mail/HA idempotenci; diagnostické scénáře nahradit kontrolou absence capture/API a offline readerem. |
| GitHub a gates | aktualizovat | Runtime image musí odmítat diagnostické routy; zachovat úplný release gate a přenositelnost. |
| Dokumentace a kontrakty | aktualizovat | Aktuální dokumentace, OpenAPI a klient, offline archiv a rollback. |
| Komentáře a poznámky | aktualizovat / odstranit | Odstranit aktivní požadavky na capture; zachovat funkční vysvětlení potvrzování a obnovy. |
| AGENTS.md | aktualizovat | Zrušit provozní diagnostiku, zachovat ostatní bezpečnostní a hlasové kontrakty. |
| Fixtures, selektory, texty | aktualizovat / odstranit | Odstranit debug ovládání, oranžový stav a export panel; zachovat hlasový orb a funkční panely. |
| Build, deploy, produkční ověření | aktualizovat | Odpojit volume a klíč bez smazání; omezit existující logy; měřit syntetickou zátěž a ověřit skutečný release a assety. |

Historické diagnostické soubory a samostatný klíč se nesmějí automaticky mazat. Provozní databáze s pamětí, LogicalCall, výsledky a potvrzením operací zůstávají aktivní. Rollback mění aplikaci, nikoliv provozní databáze.

## Opakovatelné měření režie

`scripts/measure_voice_overhead.py` běží lokálně nad izolovaným HTTP a SQLite,
bez providera, mailů nebo ovládání zařízení. Každý běh má stejných 40 heartbeatů,
40 playback-ready a 10 skutečně auditovaných config změn; původní verze navíc
vykoná 40 diagnostických metadatových batchů a create/close archivu s debug Off.
Tři běhy před a po používají stejný Python/runtime na stejném hostu. SQL počítá
INSERT/UPDATE/DELETE příkazy auditu i původního archivu, ne fyzický disk throughput.

| Metrika | Před odstraněním | Po odstranění |
|---|---:|---:|
| Funkční HTTP požadavky | 90 | 90 |
| Všechny HTTP požadavky | 132 | 90 |
| Aplikační log bytes (medián tří běhů) | 31128 | 0 |
| AuditTrail řádky | 90 | 10 |
| SQL write příkazy | 703 | 10 |
| CPU process time s (medián) | 0.2593 | 0.0703 |
| HTTP median ms (medián běhů) | 1.720 | 0.705 |
| HTTP p95 ms (medián běhů) | 7.967 | 2.199 |

Nulový log v tomto úspěšném scénáři neznamená vypnutí chybových nebo službových
logů. CPU není produkční využití serveru; latence je in-process HTTP na syntetické
zátěži. Hodnoty neprokazují kvalitu živého audia ani vyřešení všech hlasových potíží.
Raw výsledky jsou v `docs/dagmar/evidence/removal-20261006/`.

Živá read-only kontrola 2026-10-06 ověřila initialize/tools/list, přesné Mail
input/output schéma a anonymní HTTP 401 obou MCP. Mail: 20 nástrojů; HA: jeden.
DNS obou služeb je IPv4 bez IPv6. Nebyl vyvolán žádný tools/call ani mutace.
Error/result/idempotence scénáře používají skutečný adapter s fixtures.
Výpadkový scénář MCP a paměti ověřuje dokončenou hlasovou odpověď každého
navazujícího tahu se samostatnou provider response identitou před dalším vstupem.

## Kontrola referencí a funkčních hranic

Celorepozitářové vyhledání odlišuje historické evidence/inventáře (označené
jako historické), offline reader a měřicí harness od běžící aplikace. MCP stavy
`recording` patří externímu video povelu a zůstávají zachované. Android debug
manifest je samostatný nativní build a této změny se netýká. Server i browser
Voice Core nemají telemetry adapter. Historické soubory žádné runtime importy
nepoužívají. Administrativní SMTP/profile, uživatelé, hotelové změny a bezpečnostní
operace mají významový audit; konfigurace/klíč a skutečné memory mutace také.

Reconnect callback po cleanupu starého peeru ihned končí, aby jeho nově `closed`
stav omylem neukončil celý LogicalCall. Nativní close stav ověřuje unit fixture
a responsive browser scénář.

Offline read-only ověření před vydáním rozšifrovalo a ověřilo checksum všech
18 602 dostupných záznamů v 10 nesmazaných historických hovorech (13 celkem
v indexu). Archiv ani klíč nebyl změněn. Před vydáním je uchován privátní aktuální
SQL/roles dump, prostředí, oddělený archivní klíč a tři předchozí application images;
předchozí aplikace s diagnostikou není automatický rollback kandidát.

Čistý copy-out odhalil drift OpenAPI při automatickém výběru novějšího FastAPI.
Manifesty nyní fixují stávající produkční FastAPI 0.115.14; runtime závislost se
neupgraduje. Copy-out před instalací odstraňuje zděděné PYTHONPATH/NODE_PATH.
