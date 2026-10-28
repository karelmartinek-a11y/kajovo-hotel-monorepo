# Označení pokračujícího pobytu

## Matice dopadů

| Kategorie | Rozhodnutí |
| --- | --- |
| Produkční zdroj | Aktualizovat sdílené HousekeepingRooms, ReservationStamp a CSS: POBYT je uprostřed spodní poloviny těla; pole očekávaného času je prázdné. Barvy, X/Y a ostatní pevná pole ověřit beze změny. |
| Testy | Aktualizovat pokojský smoke a kontrolu 500 kombinací pro polohu, lokalizaci, nepřekrývání a prázdný čas pobytu. Admin spotřebitele ověřit beze změny. |
| CI a gates | Ověřit beze změny úplný release gate, podmíněný pokojský test, dva CI jobs a automatický deploy stejného SHA. |
| Dokumentace | Aktualizovat modul Pokoje a aktuální matici pevného layoutu. |
| Komentáře | Ověřit beze změny; žádný další komentář nepopisuje pozici označení pobytu. |
| Aktivní instrukce | Aktualizovat AGENTS.md podle nové polohy POBYT. |
| Fixtures, selektory, překlady | Aktualizovat testovací selektor pro samostatné označení; existující překlady POBYT ověřit beze změny v češtině, angličtině a ukrajinštině. |
| Build a kontrakty | Ověřit oba frontendové buildy. API/OpenAPI, generovaný klient, Android a zápisy jsou beze změny: jde o zobrazení existujícího druhu pobytu. |

## Lokální ověření

Matice osmi kategorií je uzavřena: úplný release gate 27/27 PASS,
474 backendových testů PASS, 18 cílených webových scénářů včetně pěti
úrovní názvu a 500 kombinací PASS, tři administrační scénáře PASS.
Rendery mobilu byly prohlédnuty. OpenAPI, generovaný klient a barevné tokeny
zůstaly beze změny. Následuje exact-SHA GitHub CI, automatický deploy a
produkční ověření pouze čtením; bez hotelových zápisů a onboardingového SMTP.
