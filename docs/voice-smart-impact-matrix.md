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

## Interpretace ovládání světel

| Kategorie | Rozhodnutí | Artefakty a ověření |
| --- | --- | --- |
| Produkční kód | aktualizovat | `smart_technologies.py`: instrukce, popisy schématu a odmítnutí parametrů na power akcích; `voice_smart.py`: bezpečná chyba pouze pro neodeslaný požadavek. |
| Testy | aktualizovat | Falešné MCP: nastavení barvy/jasu/teploty, toggle, on/off, celé skupiny, deduplikace i restart, odmítnutí a původní status po nejistotě. Deterministický adaptér není důkaz interpretace hlasového modelu. |
| Workflow a gates | ověřit beze změny | Nové testy jsou součástí úplného API suite v release gate a CI; placené modelové volání mimo CI. |
| Dokumentace a schémata | aktualizovat | Tento dokument a `voice-smart-technologies.md`; interní modelové schéma. HTTP OpenAPI a generovaný klient ověřit beze změny. |
| Komentáře a poznámky | ověřit beze změny | Existující popisy identit, rezervace a nejistoty nadále odpovídají kódu; nevzniká vlastní katalog. |
| Instrukce | aktualizovat | `AGENTS.md`: význam akcí, aktuální describe, zákaz oprav odeslaných povelů a oddělení hlasové přejímky. |
| Fixtures a texty | aktualizovat | Testovací describe s parametry také na toggle a rozdílnými kódy funkcí; modelové a validační texty. UI, selektory a překlady ověřit beze změny. |
| Build a deploy | ověřit beze změny | Žádná migrace ani závislost; úplný release gate, produkční API image a runtime ověření přes falešný ovládací backend. |

HA MCP server, jeho katalog a reálná světla se nemění. Přenosný Voice Core, portál a Android nemají spotřebitele interního schématu nastavení světel; jejich hranice a build se ověřují beze změny.
