# Hotelový adaptér KajaVoiceHA 2.1.1

| Kategorie | Rozhodnutí a technický dopad |
|---|---|
| Produkční kód | Aktualizovat hostovaný MCP parser, potvrzení, lifecycle, kontext, retenci a read-only panel. |
| Testy | Aktualizovat regresní fixtures a skutečné API/UI scénáře; placený Realtime pouze opt-in. |
| Workflow/gates | Ověřit úplný release gate a produkční PostgreSQL/image; nové neplacené regresní testy zahrnuje existující API suite. |
| Dokumentace/schémata | Aktualizovat správní kontrakt, runbook, OpenAPI a generovaný klient. |
| Komentáře | Aktualizovat timeout, obnovu a význam výsledků podle aktivního kódu. |
| Aktivní instrukce | Aktualizovat AGENTS.md o kompatibilitu, přesné členství a trvalé identity. |
| Fixtures/texty | Aktualizovat obsazené odstranění, mixed/no-plan/empty odpovědi a nové fáze panelu. |
| Build/deploy | Ověřit standardní main CI/deploy, backend secrets a izolaci Voice Core. |

Android a zaměstnanecký portál nejsou spotřebiteli admin registry-plan. Ověřují se beze změny; sdílené přidané modelové pole je aditivní. MCP zdroje a jeho stav nejsou součástí hotelového repozitáře.
