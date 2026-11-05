# Formulář ztrát a nálezů

Nový i upravovaný záznam v Hotel sekci CML nabízí typ, popis, pokoj,
majitele, kontakt, poznámku k předání a štítky. Kategorie, umístění,
stav, datum a čas ani výskyt času při přechodu z letního času se ve
formuláři nezobrazují a neposílají.

Při vytvoření bez `event_at` API nastaví čas události na stejný serverový
UTC okamžik jako `created_at`. Čas se určuje při založení, nikoli při
otevření formuláře. Detail jej zobrazuje v Europe/Prague. Úprava ostatních
údajů původní čas nepřepisuje. Nová kategorie a umístění zůstávají prázdné,
stav je `new`. Dosavadní údaje a samostatná akce zpracování se zachovávají.

Nativní klienti mohou dál předat původní kategorii, umístění, stav a čas.
Výstupní typy zůstávají řetězce a neprázdný čas; není potřeba migrace DB.
Oznámení nálezu používá výsledný uložený čas a původní transakční frontu.

## Matice dopadů

| Oblast | Rozsah |
| --- | --- |
| Produkční zdroj | Upravit CML editor, create DTO a výchozí serverový čas |
| Testy | Přidat create/edit scénáře, prázdná pole, shodu časů a zachování nativního vstupu; prohlížeče desktop/tablet/mobil, cs/en/uk |
| CI a release | Zapojit regresi formuláře do stávajícího browser gate; ostatní kontroly zachovat |
| Dokumentace a SSOT | Tento kontrakt a odkaz z aktuálního přehledu |
| Komentáře a instrukce | Upřesnit AGENTS; žádný nový provozní přepínač |
| Fixtures a překlady | Pouze syntetická data; existující texty a překlady zůstávají pro seznam/detail a nativní klienty |
| CML nápověda | Vlastní `kajovocmlnglite/public/library/help.json`: odpovídající pole a automatický čas ve čtyřech pohledech vytvoření/úpravy |
| OpenAPI a klient | Regenerovat schéma a sdílený klient; zachovat kompatibilní explicitní vstupy Androidu |
| Build a deploy | Pouze vlastní API image; beze změny DB, grantů a ostatních služeb |

Produkční ověření je čtecí kontrola formuláře a nasazeného artefaktu.
Vytváření testovacího nálezu v produkci by spustilo WhatsApp; regresní
zápisy proto probíhají pouze v izolované databázi a prohlížečových adaptérech.
