# Matice dopadů: HA MCP, SmartPlan a hlas

| Kategorie | Rozhodnutí | Ověření |
| --- | --- | --- |
| Produkční hlas | aktualizovat | Veřejný kontrakt/projekce, HTTPS originy, generation fences, foreground/recovery a readback. |
| MCP kód | nerelevantní pro hotel repo | Vlastní owning source/staging/release; pouze veřejné contract fixtures bez secrets. |
| Testy/fixtures | aktualizovat | Old/candidate schema/wire, identity/origin/credential canary, stale turn/cancel, původní recovery ID a provider ack stub. |
| CI/deploy | aktualizovat | Celý release gate zůstává; protected SmartPlan a skutečně ověřený source scope. |
| Dokumentace/schema | aktualizovat | voice-public-contract.md, compatibility a runbook; veřejné HTTP/OpenAPI/client ověřit beze změny dle diffu. |
| Komentáře/poznámky | aktualizovat | 30s status/35s SDK budget, metadata interval, úplný readback, scoped cancel; historické návody označené. |
| Aktivní instrukce | aktualizovat | AGENTS podle kanonického veřejného guidance, host-owned identity a consent. |
| Build/přenositelnost | aktualizovat | Čistý temp/venv/browser bez hotelu a zděděných path; alternate HTTPS mock endpoints/store, Start/Stop/read/cancel/recovery. |
| Host konfigurace | aktualizovat | Hotel injektuje vlastní endpointy/originy, alternativní host bez editace zdrojů. |
| Databáze | aktualizovat klientský store | Nullable proposal_id/request_key se přidávají do vlastní dagmar_smartplan_deliveries; schema marker 1 i původní identity zachovány pro rollback. MCP migrace provádí jen owning release, žádný cizí store v hotel deploy. |
| Mail/rezervace/DSP/Android | nerelevantní | Nemají změněný doménový kontrakt; běžné gates chrání hranice/regrese. |
| Produkční/fyzická přejímka | samostatná evidence | Active SHA/image, authenticated read-only smoke a protected stav po deploy. CI/provider stub není audio/provider ack ani fyzické měření. |

Aktuální pravidla a nedestruktivní návrat: [voice-public-contract.md](voice-public-contract.md). Číselná měření a nové CI/deploy runy patří do evidence konkrétního releasu.
