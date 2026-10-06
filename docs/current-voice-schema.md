# Současné hlasové schéma

Alembic head `0046_current_voice_schema` je neutrální checkpoint bez DDL
nebo změn aplikačních dat. Upgrade zachovává paměť, registry a jejich journály.

## Matice dopadů

| Kategorie | Fáze A | Fáze B |
| --- | --- | --- |
| Produkční kód | aktualizovat migrační head | aktualizovat řetězec a deploy/proxy |
| Testy | aktualizovat head, ověřit SQLite/PostgreSQL | odstranit historické scénáře, ověřit capabilities |
| CI a gates | ověřit beze změny | aktualizovat runtime/proxy kontroly |
| Dokumentace a manifesty | aktualizovat checkpoint | odstranit zastaralé snapshoty a indexy |
| Komentáře a poznámky | ověřit beze změny | aktualizovat podle aktivního kontraktu |
| Instrukce | aktualizovat checkpoint | ověřit aktuální capabilities |
| Fixtures a texty | ověřit beze změny | odstranit retired fixtures |
| Build, klient a deploy | ověřit beze změny | ověřit image, kontrakt a nasazení |

Kompakce řetězce je přípustná až po ověření stejného checkpointu na všech
známých nasazených databázích. Revize checkpointu se při kompaktování nemění.
Databáze bez aplikačního Alembic schématu nejsou spotřebiteli tohoto řetězce.
