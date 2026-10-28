# Náhradní název rezervace v dlaždici

## Matice dopadů

| Kategorie | Rozhodnutí |
| --- | --- |
| Produkční zdroj | Aktualizovat projekci display_name: první neprázdné jméno ubytovaného podle position → rezervující osoba → firma → agentura. Rozbalit agency v existujícím čtení rezervací; do API vracet pouze výsledný název. Web a přístupný název používají stejné pořadí; poslední náhrada je ?. |
| Testy | Aktualizovat backendové testy priorit, prázdných hodnot a expanze agency; webové testy všech pěti výsledků, tooltipu a přístupného názvu; ověřit admin spotřebitele. |
| CI a gates | Aktualizovat podmíněný pokojský test o náhradní názvy; úplný plán a dva CI jobs ověřit beze změny. Aktualizovat přesný seznam zdrojů pro users smoke jen pro čtení: pokojská projekce nevyžaduje zakládání uživatele ani SMTP. Uživatelské API mimo tuto výjimku zůstává plné. |
| Dokumentace | Aktualizovat modul Pokoje a aktuální matici layoutu na nové pořadí náhrad. |
| Komentáře | Ověřit existující komentáře; žádná nová nepodložená provider pole. |
| Aktivní instrukce | Aktualizovat AGENTS.md pro pořadí názvů a omezené produkční ověření bez nesouvisejících uživatelských zápisů. |
| Fixtures a texty | Aktualizovat scénáře s prázdným seznamem hostů, mezerami, firmou a agenturou. Existující překlady a pevné pozice ověřit beze změny. |
| Kontrakty a build | Ověřit OpenAPI a generovaný klient beze změny: agency se promítá do existujícího display_name, nepřidává se veřejné pole. Android nemá display_name ve svém DTO a ignoruje neznámá pole, jeho zobrazení a zápisy se nemění. Ověřit oba frontendové buildy a API image. |

## Lokální ověření

Matice osmi kategorií je uzavřena: úplný release gate 27/27 PASS,
474 backendových testů PASS, 18 cílených webových scénářů včetně pěti
úrovní názvu a 500 kombinací PASS, tři administrační scénáře PASS.
Rendery mobilu byly prohlédnuty. OpenAPI, generovaný klient a barevné tokeny
zůstaly beze změny. Následuje exact-SHA GitHub CI, automatický deploy a
produkční ověření pouze čtením; bez hotelových zápisů a onboardingového SMTP.
