# Pevné rozložení webových dlaždic pokojů

## Matice dopadů před implementací

| Kategorie | Rozhodnutí a rozsah |
| --- | --- |
| 1. Produkční zdroj | Sladit sdílené CSS s obrazovou předlohou: věkové počty 11 px, siluety 7 × 11 px, první skupina vlevo, prostřední uprostřed a poslední vpravo; poznámka jako samostatný vykřičník bez kulatého podkladu. Bílé číslo s existujícím černým obrysem a všechny aktuální barevné tokeny ověřit beze změny. |
| 2. Testy | Ověřit geometrii, čtyři pevné řádky, rozestupy věkových skupin, velikost běžných čísel, nepřekrytý vykřičník bez podkladu, vlajky, X/Y, množství, blokace a zachované zápisy. Ověřit admin spotřebitele, mobil 320/390, tablet a desktop. |
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
Věkové skupiny mají čísla 11 px a siluety 7 × 11 px; první skupina je vlevo,
prostřední uprostřed a poslední vpravo v rámci svých pevných třetin.
Vícemístná čísla se přizpůsobí pouze vlastnímu poli. Poznámku označuje
samostatný červený vykřičník 13 px bez podkladu, rámečku nebo stínu.
X/Y znamená uplynulé noci k vybranému dni / celkové noci; příjezd 0/Y,
odjezd Y/Y. Číselné údaje se ve vlastních polích přizpůsobují délce bez překrytí.

Blokace se vykreslují jen v části bez rezervace; původní data blokací zůstávají
čitelná v detailu. Kontrakt čtení, identity rezervací/pokojů, RBAC, verze,
potvrzování požadavků a zápisy stavů se nemění. Neznámá rezervace ani více
rezervací v jednom bloku se nepovažují za prázdný pokoj nebo za odhadnutý stav.
Nejsou autorizované produkční syntetické rezervace, hotelové zápisy ani SMTP.

## Ověření layoutu

Geometrické a vizuální kontroly pokrývají 320/390/834/1440 px, dlouhá jména,
neznámé a trojciferné počty, všech osm stavů pokojů a čtyři stavy rezervací.
Sada 500 kombinací hlídá pevné souřadnice řádků, číselná pole, centrování
postýlky a blokace bez překryvu s rezervací. Samostatné regresní kontroly
porovnávají zarovnání věkových skupin s předlohou, velikost běžných čísel
a siluet a samostatný vykřičník bez podkladu. Funkční smoke zachovává změny
stavů i ověřené potvrzování požadavků, persistenci a ochranu nejistých zápisů.

Barevné tokeny, API/OpenAPI, generovaný klient, Android a zápisové kontrakty
se tímto sladěním nemění. Produkční dokončení vyžaduje úspěšné GitHub CI,
nasazení stejného commitu a nové čtení skutečného rozhraní v prohlížeči.
