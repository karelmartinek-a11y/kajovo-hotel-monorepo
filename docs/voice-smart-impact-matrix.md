# Smart technologie: matice dopadů MCP v2

| Kategorie | Rozhodnutí | Artefakty a ověření |
| --- | --- | --- |
| Produkční kód | aktualizovat | MCP v2 schéma, kompaktní kontext, relací izolované výběry, trvalé delivery receipts a obrazová historie. |
| Testy | aktualizovat | Globální řádky, stránkování, kontext a revize, idempotence i po restartu, potvrzení obrázků, migrace a živý restore guard. |
| Workflow a gates | ověřit beze změny | Úplný release gate obsahuje API/Voice Core/UI testy; produkční image importuje skutečný adaptér. Placená přejímka zůstává mimo CI. |
| Dokumentace a schémata | aktualizovat | Voice Core a MCP runbook. Veřejný OpenAPI i generovaný klient ověřit beze změny, HTTP kontrakt se nemění. |
| Komentáře a poznámky | aktualizovat | Aktivní kontrakt je v2, úplný katalog zůstává na MCP. |
| Instrukce | aktualizovat | AGENTS.md vyžaduje serverové identity, kompaktní výsledky a pravdivé potvrzení odeslání. |
| Fixtures a texty | aktualizovat | V2 testovací odpovědi a modelové instrukce. UI texty, selektory a překlady ověřit beze změny. |
| Build a deploy | aktualizovat | Migrace 0041; závislosti, secret storage a deploy gates ověřit beze změny. |

Portál, přenosný Voice Core a Android: ověřit beze změny; nemají spotřebitele změněného MCP rozhraní. MCP server a registr zařízení: ověřit beze změny přes veřejný kontrakt, bez zásahu do služby.
