# Kompatibilita veřejných MCP a hlasu

| Cesta | Podporovaný základ | Brána |
| --- | --- | --- |
| HA live před S2 | 2.1.24, API 2, complete/readback a původní backend write identity | Export old fixture, schema/wire/semantická kontrola; auth/integrity chyba bez fallbacku. |
| HA kandidát | smart/2, profil ha-smart/2.1, pravdivá implementation 2.1.25 | Kanonický digest, zachované backend identity, nová operation pravidla/outputSchema; vlastní MCP gates před S2. |
| SmartPlan live před S3 | 1.6.7, všech 17 veřejných tools, navigation/1 | Připnutý old public export, známý profil a ověřené schemas. |
| SmartPlan kandidát | 1.6.8, navigation/1, smartplan-navigation-1-2025-v2, guidance 2026-10-13.4 | /contract+tools/list, digest, jednotná validace/output, scoped cancellation a vlastní MCP gates před S3. |
| Starý SmartPlan legacy host | Připnutá stará sada 11 nástrojů | Jen známý kompatibilní profil, původní durable receipt a potvrzovací politika. |
| Modelová projekce | dagmar-public-contract/1 | Vlastní projection digest, zachované constraints, matching session.updated; provider stub není production ack. |
| Neznámý breaking kontrakt | Dotčená schopnost unavailable | Běžný rozhovor/druhý MCP/recovery původních IDs pokračují. |

Implementation verze se nepřepisuje pro splnění starého pinu. Volitelná aditivní metadata nesmějí automaticky odstavit vše. Starý acknowledged snapshot lze používat jen při skutečné podpoře jeho profilu; změna profilu vyžaduje ověření a nový ack před použitím.

Jde o testovanou podporu klienta a pořadí releasů, nikoli důkaz aktivace kandidátů. Active release/SHA/image, nové CI/deploy runy, public smoke a neprovedené měření eviduje konkrétní release. Aktuální návod a návrat: [voice-public-contract.md](voice-public-contract.md).
