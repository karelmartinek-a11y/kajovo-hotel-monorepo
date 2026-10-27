# Matice dopadů dlaždic pokojů

| Kategorie | Rozhodnutí |
|---|---|
| Produkční zdroj | Aktualizovat sdílené webové dlaždice a paletu; odstranit z přehledu celoplošný pokračující pobyt. Doplnit opt-in čtení skutečných Better Hotel blokací mode=block do serverové projekce. |
| Testy | Aktualizovat web/admin očekávání, přidat hranice blokací, prázdné poloviny, obrys a kontrast čísla, geometrii, detail a zachované zápisy. |
| GitHub/gates | Aktualizovat CI runner na explicitní Ubuntu 24.04 podporované Playwrightem. Synchronizovat produkční PostgreSQL 16.15 s CI/recovery a odmítat databázový downgrade před vypnutím služeb. Ověřit beze změny main-only gates, runtime image, úplný release gate a návazný deploy pro stejné SHA. |
| Dokumentace/schémata | Aktualizovat module-pokoje, OpenAPI a generovaný klient. |
| Komentáře/poznámky | Odstranit neplatné popisy pokračujícího pobytu a staré palety; ověřit výskyty v celém repozitáři. |
| Aktivní instrukce | Použít aktuální uživatelské zadání a lokální odkazy na Klíčenku; secrets nevypisovat. |
| Fixtures/texty/snapshoty | Aktualizovat stavová očekávání a lokalizované názvy, doplnit blokace; ověřit skutečné rendery 320–1440 px. |
| Build/spotřebitelé | Ověřit oba frontendové buildy a API image. Android zachovává původní režim bez include_blocks; nový seznam je aditivní. |

Bez databázové migrace: blokace se pouze čtou z poskytovatele. Nemění se hotelový číselník, autentizace, RBAC, CSRF, verzované zápisy ani požadavky psa/postýlky. Bílé číslo má stejný tmavý obrys na každém pozadí. Produkční kvalifikace nevytváří ani nemění hotelová data.

## Oprava čitelnosti a připojení (2026-10-27)

Čtyři sloupce na telefonu zůstávají, výška se zvětšuje na 188 px (desktop 164 px). Věkové počty jsou na mobilu pod sebou, hlavní údaje mají alespoň 14 px. Počet psů vyjadřuje ikona s ×N; detail, potvrzování a stavové operace se nemění. Všech osm barev záhlaví i čtyři barvy rezervací zůstávají. Bílé číslo má na každém pozadí stejný tenčí tmavý obrys; blokace leží pod údaji.

Deploy při změně přístupů doplňuje skutečný autentizovaný GET inventáře Better Hotelu před přepsáním konfigurace a zastavením služeb. Neplatné tokeny vyžadují obnovu u poskytovatele; pouhá přítomnost tokenů není důkaz připojení. Jednotkové testy pokrývají odmítnutí tokenů, chybnou odpověď i zákaz přesměrování tokenů. Lokální vizuální testy používají označená testovací data a nenahrazují produkční ověření poskytovatele.
