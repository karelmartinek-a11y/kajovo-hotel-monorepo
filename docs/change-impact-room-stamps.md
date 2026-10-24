# Matice dopadů dlaždic pokojů

| Kategorie | Rozhodnutí |
|---|---|
| Produkční zdroj | Aktualizovat sdílené webové dlaždice a paletu; odstranit z přehledu celoplošný pokračující pobyt. Doplnit opt-in čtení skutečných Better Hotel blokací mode=block do serverové projekce. |
| Testy | Aktualizovat web/admin očekávání, přidat hranice blokací, prázdné poloviny, obrys a kontrast čísla, geometrii, detail a zachované zápisy. |
| GitHub/gates | Aktualizovat CI runner na explicitní Ubuntu 24.04 podporované Playwrightem. Ověřit beze změny main-only gates, runtime image, úplný release gate a návazný deploy pro stejné SHA. |
| Dokumentace/schémata | Aktualizovat module-pokoje, OpenAPI a generovaný klient. |
| Komentáře/poznámky | Odstranit neplatné popisy pokračujícího pobytu a staré palety; ověřit výskyty v celém repozitáři. |
| Aktivní instrukce | Aktualizovat AGENTS pro nové webové zobrazení. |
| Fixtures/texty/snapshoty | Aktualizovat stavová očekávání a lokalizované názvy, doplnit blokace; ověřit skutečné rendery 320–1440 px. |
| Build/spotřebitelé | Ověřit oba frontendové buildy a API image. Android zachovává původní režim bez include_blocks; nový seznam je aditivní. |

Bez databázové migrace: blokace se pouze čtou z poskytovatele. Nemění se hotelový číselník, autentizace, RBAC, CSRF, verzované zápisy ani požadavky psa/postýlky. Bílé číslo má stejný tmavý obrys na každém pozadí. Produkční kvalifikace nevytváří ani nemění hotelová data.
