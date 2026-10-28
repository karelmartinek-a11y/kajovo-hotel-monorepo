# Pevné rozložení webových dlaždic pokojů

## Matice dopadů před implementací

| Kategorie | Rozhodnutí a rozsah |
| --- | --- |
| 1. Produkční zdroj | Aktualizovat sdílené HousekeepingRooms, ReservationStamp, piktogramy a CSS. Bílé číslo s existujícím černým obrysem a všechny aktuální barevné tokeny ověřit beze změny. |
| 2. Testy | Aktualizovat webové geometrii, čtyři pevné řádky, jména, lokální vlajky, X/Y, množství, blokace a zachované zápisy. Ověřit admin spotřebitele, mobil 320/390, tablet a desktop. |
| 3. CI a gates | Aktualizovat podmíněné UI ověření změněného layoutu ve validate; úplný release_gate.py, dva povinné GitHub CI jobs a návazný deploy stejného main SHA ověřit beze změny. Pro frontendové změny zvolit users smoke jen pro čtení, aby deploy nevyvolal nesouvisející založení uživatele a SMTP. |
| 4. Dokumentace | Aktualizovat module-pokoje a dosavadní matici razítek na aktuální kontrakt; zdokumentovat geometrii a zachovanou paletu. |
| 5. Komentáře | Nahradit původní popisy levé/pravé poloviny, 106/112 px a čísel zemí tam, kde popisují webovou dlaždici. |
| 6. Aktivní instrukce | Aktualizovat AGENTS.md pro pevné webové řádky, jména/vlajku, X/Y, 122 px a číslo bílé s tmavým obrysem. |
| 7. Fixtures, texty a selektory | Aktualizovat relevantní webové testy a překlady případných nových hlášení; zachovat skutečné konflikty jako neověřená data, nikoli běžné bílé rezervace. |
| 8. Build a kontrakty | Aktualizovat přesně verzovanou lokální sadu SVG vlajek a lockfile. Build obou frontendů; OpenAPI, API producent, generovaný klient a Android ověřit beze změny, protože se nemění serverový kontrakt. |

## Rozhraní a hranice

Výška dlaždice je 122 px na všech šířkách. Mobil zachovává čtyři sloupce.
Záhlaví má 18 px, rezervační část dva pevné bloky po 51 px: odjezd nahoře,
příjezd dole. Pokračující pobyt vyplní tělo svou původní stavovou barvou,
obsah zůstává na stejných horních souřadnicích. Každý pobyt má jméno a vlajku,
tři věkové počty, čas s X/Y a pevná pole psa, postýlky a poznámky.
X/Y znamená uplynulé noci k vybranému dni / celkové noci; příjezd 0/Y,
odjezd Y/Y. Číselné údaje se ve vlastních polích přizpůsobují délce bez překrytí.

Blokace se vykreslují jen v části bez rezervace; původní data blokací zůstávají
čitelná v detailu. Kontrakt čtení, identity rezervací/pokojů, RBAC, verze,
potvrzování požadavků a zápisy stavů se nemění. Neznámá rezervace ani více
rezervací v jednom bloku se nepovažují za prázdný pokoj nebo za odhadnutý stav.
Nejsou autorizované produkční syntetické rezervace, hotelové zápisy ani SMTP.

## Uzavření lokální validace

Všech osm kategorií bylo posouzeno a příslušné artefakty synchronizovány.
Úplný release gate prošel všech 27 kontrol včetně 467 backendových testů,
obou frontendových buildů, kontraktů a prohlížečové baseline. Pokojský smoke
prošel 51 scénářů, administrační spotřebitel devět scénářů a závěrečná
geometrická/vizuální sada 12 scénářů na desktopu, tabletu a telefonu.
Kontrola 500 kombinací zahrnuje 320/390/834/1440 px, dlouhá jména,
neznámé a trojciferné počty, všech osm stavů pokojů a čtyři stavy rezervací.
Rendery byly prohlédnuty. Barevné tokeny, API/OpenAPI, generovaný klient,
Android a zápisové kontrakty nemají změnu. Nový je pouze tento dokument;
žádný soubor není odstraněn. Produkční dokončení dokládá následný GitHub CI,
automatický deploy pro stejný commit a čtení skutečného rozhraní.
