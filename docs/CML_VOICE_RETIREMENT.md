# Přesun hlasu do KájovoCML

Aktivním vlastníkem hlasového produktu je po koordinovaném přepnutí
repozitář `karelmartinek-a11y/kajovocmlnglite`, adresář `voice/`.
Hotel nebude importovat Dagmar ani instalovat její balíčky do API/admin
image. Staré hlasové GET adresy přesměrují do CML; zápisy skončí 410.
Nativní Hotel API/Android a CML hotelové obchodní funkce se nemění.

Historické portable balíčky v `historical/voice-packages` a `historical/voice-hotel-tests` nejsou runtime
ani kvalifikace nového hlasu. Uchovávají původní implementaci/testy pro
forenzní porovnání a rollback. Nový SDK worker, per-user paměť, oprávnění,
kapacita a hlasová UI mají vlastní testy v CML. Historická data v Hotel DB
se nemažou; diagnostické archivy a jejich klíče zůstávají nedotčené.

Přepnutí bylo dokončeno 2. 11. 2026. Produkční API/admin běží ze zdroje
`001cd148c21e72182df42eef35563bb483a04662`, CML hlas ze zdroje
`8621aa09a82034256a35568e5162f146c5190967`. Záloha a migrační manifest jsou
v `/var/backups/kajovocml-voice/final-20261102`; původní hlas neměl při
přepnutí aktivní provider spojení. Ostatní Hotel web a PostgreSQL zůstaly
ve stejných kontejnerech a data nebyla obnovována ani mazána. Vlastník
výslovně povolil dokončení bez fyzického mikrofonu. Další placený test
neproběhl. Aktuální přejímka je v CML `docs/voice/CUTOVER.json`.

Hlasové proměnné a provider přístupy se nepředávají novému Hotel kontejneru.
Jejich původní chráněná kopie zůstává pouze v záloze pro návrat kódu.
