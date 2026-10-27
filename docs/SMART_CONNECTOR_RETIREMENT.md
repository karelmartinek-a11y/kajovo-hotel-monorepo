# Hotelové konektory SMART

Dagmar neobsahuje historické konektory KajaVoiceHA/SmartPlan, jejich veřejné
kontraktové fixtures, modelové nástroje, API routy ani browser panely. Hotelové
aliasy `voice_smart`, `voice_registry` a `smart_technologies` jsou odstraněné.
Staré proměnné prostředí nemohou schopnosti aktivovat; deploy jejich přenos odmítá.
Není k dispozici propojení vlastníka, ukládání klíče ani připojovací transport.

Běžný hlasový hovor, logický lifecycle, paměť/Lístečky a volitelný native Mail
zůstávají v Dagmar. Mail používá vlastní pomocný modul `audio_confirmation`
pro rozpoznávání hlasového souhlasu. Voice Core zůstává přenositelný a bez nástrojů.

Historické tabulky a migrační checkpointy jsou zachované. Modul
`retired_connector_storage` obsahuje pouze metadata a aditivní kompatibilitu
existujících tabulek, bez čtení nebo zápisu tajemství a bez síťového klienta.
Migrace nemažou operace, doručení, účtenky ani původní ID a nevytvářejí souhlas
ze starých nullable údajů. Offline diagnostický archiv zůstává nedotčený.

Současný KajovoSmart, HA, jeho přístupy, služby a scénáře se spravují odděleně.
Hotelový release je nemění a neprovádí spínací ani placené provider testy.
API/admin deploy zachovává web, PostgreSQL, ostatní služby a Nginx.
Před nasazením se koordinuje okamžik chráněných runtime snapshotů s jejich správcem.

## Matice dopadů

| Kategorie | Rozhodnutí a ověření |
| --- | --- |
| Produkční zdroje | odstranit konektory, dispatch, routy, panely a hotelové aliasy; zachovat hlas, paměť a Mail |
| Testy | odstranit výhradně testy odstraněných schopností; aktualizovat lifecycle a ověřit absenci i zachování historie |
| CI a gates | odstranit registry/owner panel scénáře; zachovat baseline, paměť, lifecycle, copy-out, image a PostgreSQL |
| Dokumentace a schémata | odstranit návody starých schopností; aktualizovat současný stav a generované kontrakty |
| Komentáře a poznámky | odstranit staré instrukce a aktualizovat sdílenou orchestraci |
| AGENTS | aktualizovat hranici Dagmar a nepřítomnost konektorů |
| Fixtures a texty | odstranit staré katalogy a UI selektory; zachovat Mail souhlas a paměťové scénáře |
| Build, generování, deploy | aktualizovat OpenAPI/klienta a API image kontrolu; zachovat main-only řetězec |
| Android | ověřit beze změny: nespotřebovává odstraněné administrátorské hlasové routy |
