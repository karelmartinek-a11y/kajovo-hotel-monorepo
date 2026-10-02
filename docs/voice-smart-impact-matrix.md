# Smart technologie: matice dopadů

| Kategorie | Rozhodnutí | Artefakty a ověření |
| --- | --- | --- |
| Produkční kód | aktualizovat | Hotelový MCP/Realtime adaptér s explicitním očíslováním úplného katalogu, admin, obecné browserové lifecycle porty; standalone server zůstává bez nástrojů. |
| Testy | aktualizovat | MCP kontrakt, potvrzování událostí, idempotence, relace, obraz, UI a placená přejímka. |
| Workflow a gates | aktualizovat | API integrační testy a import produkčního image; placené volání pouze s opt-in mimo CI. |
| Dokumentace a schémata | aktualizovat | Voice Core, runbook, OpenAPI a generovaný klient. |
| Komentáře a poznámky | aktualizovat | Tvrzení o chybějících nástrojích platí jen pro standalone. |
| Instrukce | aktualizovat | AGENTS.md odděluje portable v1 od hotelového adaptéru. |
| Fixtures a texty | aktualizovat | Kontraktové fixtures nejsou provozní katalog; host ukazuje dostupnost technologií. |
| Build a deploy | aktualizovat | Python MCP SDK, WebSocket, JSON Schema, explicitní Docker závislosti a backendový secret včetně zachování práv 0600 při SSH deployi. |

Portál a Android: ověřit beze změny, žádný hlasový endpoint ani oprávnění nepřibývá. MCP server a jeho registr zařízení: ověřit beze změny, hotel používá pouze veřejný schválený kontrakt.
