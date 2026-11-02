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

Tento zdroj připravuje přepnutí. Nenasazovat jej před ověřením CML hlasu,
konzistentními zálohami, migračním manifestem a potvrzením, že neprobíhá
původní hovor. Placená přejímka vyžaduje samostatně schválený limit.
