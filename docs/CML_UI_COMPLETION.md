# Kvalifikace nového Hotel UI

Nové UI v `apps/kajovo-hotel-api/app/web_ui/` používá skutečné vlastní API
podle předlohy `UIKajovoCMLNgLite(1).ZIP`, bez převzetí původního autorského
frontendového kódu. První vydání je nasazené od 1. 11. 2026; výchozí
publikovaný zdroj je `8cb10128e6382a1cab161087e66eb1f36bbbe42d`.
Přesná následující revize patří skutečnému image/release manifestu.
Kvalifikace zdroje sama netvrdí jeho aktivaci v produkci.

| Oblast | Kvalifikovaný rozsah nového UI |
| --- | --- |
| Runtime zdroj | Nový `web_ui/app.js` a styly pokojů; ověřená role, platný den a čitelné mobilní karty; historie chatu dosažitelná klávesnicí |
| Testy | 18 rolových a 8 pokojských browserových případů; reálná gateway nad izolovanými původními routery |
| CI a gate | Povinné `native-web-role-browser` a `native-web-room-browser`; všechny původní gate pokračují bez opt-out |
| Dokumentace | Aktuální stav, rozsah ověření a zbývající přejímka v těchto dvou dokumentech |
| Komentáře a pravidla | `AGENTS.md` popisuje generaci role a zachování původní potvrzené identity |
| Fixtures | Kontrolované čtecí role; existující syntetické DB a fake poskytovatelé |
| Backend, API, data, nativní klienti | Kontrakty, RBAC, migrace, výpočty, provider konfigurace i původní data beze změny |
| Build a nasazení | Publikovaný SHA, povinné CI, odpovídající API image, záloha a návrat vlastního kódu |

## Funkční kvalifikace

`pnpm --filter @kajovo/kajovo-hotel-web test:cml-roles` ověřuje poslední
ruční roli, zrušený automatický přechod mezi moduly a odmítnutou roli bez
ztráty původní identity. Místní Chromium i WebKit mají 18 PASS na
1920/834/390 px; tento runner má jen izolované GET adaptéry.

Integrační `npm run test:hotel-ui` v CML checkoutu se zapnutým
`CML_HOTEL_FULL_UI=1` používá skutečnou podepsanou gateway, původní Hotel
routery, syntetické DB a fake poskytovatele. Pokrývá hlavní pracovní
pohledy, rolovou unii a automatický výběr bez admin eskalace, zachování
role otevřeného formuláře, původní PDF, snídaně, sklad, evidence,
fotografie a pokojské požadavky. Ztracené odpovědi se obnovují čtením
původního výsledku bez opakování zápisu. Produkční hotelové zápisy,
SMTP zprávy, fyzické povely a placená volání tato kvalifikace neprovádí.

Syntaxi všech nových JS a manifestové role ověřuje
`scripts/check_cml_web_ui.mjs`. Testy časů zachovávají skutečný kontrakt
Europe/Prague včetně jarní mezery a podzimního dvojího času. Nový krok
release gate má vlastní regresní kontrolu; nezrušuje žádný původní krok.
Zelené lokální kontroly nenahrazují CI konkrétního publikovaného SHA.

## Hranice přejímky

Úplná shoda všech obrazovek/rozměrů, překlady, tisk a přístupnost zůstávají
**ODLOŽENO PO PRVNÍM NASAZENÍ**. Vybrané rendery nejsou úplná designová
matice. Reálné doručení externího push/SMTP ani živá placená kvalita modelu
nejsou syntetický PASS. Hlas je úplně vyňatý z integrace CML; původní UI,
přihlášení a backend zůstávají dostupné a neprovádí se testovací hovor.

Nový image musí doložit vazbu na publikovaný zdroj. Při UI opravě bez
schématové změny se databáze nemigruje ani neobnovuje a ostatní služby se
nerestartují. Detail běžícího prvního vydání a následných oprav sleduje
centrální CML release evidence `docs/unified-ui/FIRST_RELEASE.json`.

## Zachované kontrakty pracovních modulů

`test:cml-rooms` ověřuje šest desktopových a dvě mobilní karty podle
předlohy, viditelné popisky filtrů a přehled bez vodorovného přesahu na
1400/834/390/320 px. Prázdný nebo neplatný den zachová původní přehled
a nevolá backend. Změna dne, návrat na dnešek a filtr patra/pokoje zachovávají
skutečné parametry čtení. Po obnově zůstává zadaný filtr a čtecí role nesmí
změnit úklid. Oba enginy mají 8 PASS. Rychlé akce závady/nálezu podle
původních práv zůstávají navíc oproti ukázce; úplná vizuální matice není PASS.

Pokoje rozlišují aktuální úklid od pobytů vybraného dne. Změna používá
původní očekávaný stav a následné načtení. Pes/postýlka se potvrzují pro
konkrétní rezervaci, pokoj, den, množství a verzi teprve po skutečném
natížení. Potvrzené vybavení musí přetrvat nové načtení. Nejasný původní
výsledek se nejprve čte, nikoli opakuje.

Snídaně zachovávají původní denní seznam/souhrn, rezervační diety a jejich
verze, výdej i návrat, jednotlivé i výslovně zvolené hromadné operace.
Otevřené datum přežije reload přes omezený CML state bridge. Smazání
konkrétního dne se ověřuje vůči nedotčeným jiným dnům; import či ruční
provider synchronizace nevzniká jako náhradní ovládání.

Evidence nálezů, závad a hlášení mají samostatné nové/editor/detail stránky.
Fotografie používají původní upload a autorizované originální soubory.
Pokojská s write-only oprávněním může vytvořit záznam a připojit své
fotografie bez získání read grantu: výsledkem je potvrzený počet příloh,
nikoli neautorizovaná galerie nebo možnost číst cizí evidenci.

Skladová karta zachovává základní jednotku; editace katalogu neposílá
`current_stock`. Vícerádkové doklady mají původní druh, řádky, kusy, datum,
dodavatele, referenci a poznámky. Opakované položky kontroluje také backend.
Doklady i jednotlivé pohyby sdílejí zámky skladových PK a číselná řada má
transakční advisory lock prefixu/roku. Mazání dokladu smí vrátit zásobu
jen jednou a zůstává pouze správci. Skladník má původní povolené pohyby,
seznam/detail dokladů a historii. Následné čtení ověřuje doklad i pohyby.
Piktogram má původní multipart endpoint a chráněný originál; vazba, velikost
a SHA-256 vybraných bajtů se porovnávají pouze v paměti prohlížeče.

Soukromý textový chat zachovává historii a původní autoritu účastníků.
Posuvná historie je dosažitelná klávesou Tab a Shift+Tab a posouvá se
PageUp bez opuštění konverzace. Regrese `test:hotel-chat` v CML checkoutu
prošla v Chromiu i WebKitu na 1920/834/390 px nad izolovanými daty;
zahrnuje původní obnovu odpovědi a ochranu cizích konverzací. Nejde
o skutečné odeslání v produkci nebo úplnou přejímku přístupnosti.
Sender-bound GET `client_message_id` nevytváří zprávu, účastníka ani stav
přečtení; nenalezení neprokazuje neodeslání. ASC `after_id` doplňuje původní
`before_id` a dovybírá příchozí stránky bez vynechání. Rozpracovaný text,
kurzor a původní ID zůstávají zachované při obnově či přepnutí podsekce.
Push metadata a skutečné OS doručení jsou oddělené podle runbooku integrace.
