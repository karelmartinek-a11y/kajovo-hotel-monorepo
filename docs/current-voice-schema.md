# Současné hlasové schéma

Alembic má jediný head `0046_current_voice_schema`, který přímo navazuje na
`0043_voice_registry_plans`. Upgrade i downgrade checkpointu jsou no-op:
neprovádějí DDL ani změny aplikačních dat. Nasazené databáze již používají stejnou
identitu checkpointu. Upgrade head je opakovatelný a zachovává paměť, registry a journály.

Dagmar podporuje `assistant_memory` a `smart_technologie` a volitelný native Realtime MCP `hotel_mail`, který vyžaduje samostatnou živou akceptaci před aktivací. Mail používá aditivní tabulky `dagmar_mail_*` a vlastní schema marker verze 1; oba původní checkpointy zůstávají zachované. Viz [Mail MCP integration](MAIL_MCP_INTEGRATION.md). Hotelové SMTP,
reset/unlock/onboarding a snídaňový import mají samostatné kontrakty.
Historické snapshoty odstraněných schopností a jejich indexy nejsou součástí
aktuálního stromu; původní záznamy zůstávají v Git historii. Offline diagnostický
archiv a původní ledger placených testů mají vlastní pravidla zachování.

## Uzavřená matice dopadů

| Kategorie | Výsledek |
| --- | --- |
| Produkční kód | aktualizovat migrační řetězec, deploy a proxy; hlasové schopnosti ověřit beze změny |
| Testy | aktualizovat checkpoint a podporované routy/schopnosti; odstranit historické scénáře |
| CI a gates | aktualizovat kontrolu aktuálních rout a proxy; ostatní gates ověřit beze změny |
| Dokumentace a manifesty | aktualizovat schéma; odstranit zastaralé snapshoty a indexy |
| Komentáře a poznámky | aktualizovat aktuální kontrakt; ostatní ověřit beze změny |
| Instrukce | aktualizovat checkpoint a současné schopnosti |
| Fixtures a texty | odstranit historické fixtures; současné SMTP a UI ověřit beze změny |
| Build, klient a deploy | ověřit image, PostgreSQL, OpenAPI, generovaný klient a nasazení beze změny kontraktu |

Neutrální checkpoint se před kompakcí nasazuje a ověřuje na všech známých
spotřebitelích řetězce. Při kompakci se jeho revision ID nemění. Samostatné
databáze s jiným řetězcem nebo bez aplikačního Alembic schématu se neupravují.
