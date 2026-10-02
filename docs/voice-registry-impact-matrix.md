# KajaVoiceHA 2.1: matice dopadů

| Kategorie | Rozhodnutí | Kontrakt a ověření |
|---|---|---|
| Produkční kód | aktualizovat | Hotelový MCP dispatcher, oddělené místnosti, hlasové potvrzení a read-only admin panel. |
| Testy | aktualizovat | Validace, skutečný dispatcher/DB, provider události, migrace, RBAC a responzivní UI. |
| Workflow a gates | aktualizovat | Neplacené registry kontroly v úplném release gate; PostgreSQL runtime ověření. |
| Dokumentace a schémata | aktualizovat | MCP runbook, OpenAPI, generovaný klient a testovací matice. |
| Komentáře a poznámky | aktualizovat | Aktuální prepare/apply a backendové potvrzení, bez historických očekávání. |
| Aktivní instrukce | aktualizovat | AGENTS.md: potvrzení pouze hlasem, metadata a dohledání původního zápisu. |
| Fixtures a uživatelské texty | aktualizovat | Návrhy, chybové stavy, podvržené potvrzení a read-only průběh. |
| Build a deploy | aktualizovat | Aditivní migrace; stávající secret storage a CI→deploy nad stejným SHA ověřit beze změny. |

Portable Voice Core, zaměstnanecký portál a Android: ověřit beze změny; nekonzumují hotelový MCP správní kontrakt. MCP službu neměnit. Produkční změnová přejímka smí měnit pouze unikátní dočasné místnosti; skutečná zařízení zůstávají beze změny. Přepis, audio, obsah návrhu a tokeny nejsou trvalými registry artefakty.
