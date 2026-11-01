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

**Změna zadání 1. 11. 2026:** autoritou pro Hotel → Pokojská → Přehled
pokojů je původní Hotel UI, nikoli demo snímky CML. Toto pravidlo platí
pro rozměry, obsah, barvy, validace i chování dlaždic na všech šířkách.
Samostatný `room-tiles.css` používá pevnou původní paletu, nezávislou na
barvách menu. Výška je 122 px, proužek 18 px a poloviny těla 51 px;
pod 600 px zůstávají čtyři sloupce. Pořadí pokojů, bílé prázdné části,
samostatné stavy rezervací, blokace bez překryvu pobytu a značka POBYT
odpovídají původnímu přehledu. Původní piktogramy jsou statické SVG
obrázky; React komponenty ani původní frontendová logika se nepřebírají.

`test:cml-rooms` skutečně renderuje původní komponentu pouze jako testovací
referenci. Porovnává geometrii i paletu osmi stavů na 1400/834/390/320 px,
obsah, chybějící údaje, konflikty, blokace a odolnost proti změně tématu.
Zachovává kontroly platného dne, filtrů a zakázaného zápisu čtecí rolí.
Syntetický zápis ověřuje původní expected_status, idempotency ID, obnovu
ztraceného potvrzení bez druhého zápisu a následné čtení změněné barvy.
Přehled se obnovuje po 60 sekundách a při návratu do okna, mimo otevřený
detail; chyba obnovy výslovně označuje možné zastarání dat.

Na následné výslovné zadání kontrastu se zachovávají barvy stavů, ale
obrys psa je zesílený na 1 zobrazovaný px, upozornění má tmavě červenou
výplň s bílým obrysem a zaměření dvojitý světlý/tmavý okraj. Tmavé
stavové akce mají bílé písmo i při zakázání; dostupnost nadále vyjadřuje
skutečný `disabled` a přerušovaná hrana. Test měří kontrast textu dlaždic
a dialogů nejméně 4,5:1 a spouští axe kontrolu dialogu. Bílá čísla pokojů
se čtou proti původnímu tmavému obrysu; samotná výplň proti světlé
stavové barvě není samostatným důkazem kontrastu. Žádná obecná úplná
přejímka přístupnosti se tím neoznačuje PASS.

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

## Původní chování otevření pokoje

Rozsah dopadu navazující opravy (1. 11. 2026):

| Oblast | Postup |
| --- | --- |
| Runtime | Aktualizovat pouze spodní detail pokoje a blokování jeho zavření při probíhajícím zápisu/ověření. |
| Testy | Doplnit nativní room browser a skutečnou izolovanou CML gateway; původní read-back a lost-ACK scénáře zachovat. |
| CI/gates | Ověřit beze změny celý povinný plán nad novým main. |
| Dokumentace/manifesty | Aktualizovat tento kontrakt a provozní evidenci; katalog/API schéma beze změny. |
| Komentáře | Doplnit jen vysvětlení vazby spodního detailu na viditelnou část iframe. |
| Pokyny | Doplnit původní spodní detail a jeho blokující průběh do AGENTS.md. |
| Fixtures/texty | Zachovat syntetická data a skutečné původní API argumenty, doplnit zadržení odpovědi. |
| Build/API/Android/hlas | API image z publikovaného zdroje; Python, kontrakty, Android, hlas, proxy a credentials ověřit beze změny. |

Nový runtime musí otevřít pokoj u spodního okraje právě viditelné části
CML, nejvýše 680 px široký a 84 % dostupné výšky (maximum 800 px); na
telefonu 80 % a původní horní zaoblení. Probíhající zápis i read-back
blokují Escape a zavírací tlačítko. Po ověření se detail zavře; nejistota
ponechá původní čtecí obnovu bez opakování zápisu. Barvy dlaždic se nemění.
Úplná přejímka zůstává ODLOŽENO PO PRVNÍM NASAZENÍ.

Cílená místní kvalifikace: původní comparator dlaždic a spodní detail
1400/834/390/320 v Chromiu i WebKitu PASS, včetně dvou stavových sloupců,
platného dne, neznámých dat, tématu, kontrastu a zadrženého zápisu i
read-backu po ztrátě odpovědi. Původní role browser: 18 případů PASS.
Skutečná izolovaná CML gateway: původní Hotel UI průchody obou enginů
PASS; cílený spodní detail/zakázané zavření/ověřený návrat PASS na
1920/390. První regrese na původním 270fd34 selhala: spodní hrana detailu
894 místo 918 a výška 862 místo původního omezení. Oprava nepřebírá React
implementaci; původní komponenta se dál používá pouze v testu.

Secrets kontrola aplikace a task diffu je čistá. Celý strom má 9
historických shod ve třech nezměněných souborech (Android public client
config, SMTP test fixtures a starší evidence); jejich bajty odpovídají
výchozímu 270fd34, bez nové výjimky/allowlistu. CI a produkční kvalifikace
nového SHA se dokládají až po skutečném běhu.

## Pokojská a snídaně – původní portál

Rozsah je omezený na tyto dva pohledy. Runtime: obnovit mobilní snídaňové
dlaždice, jejich obsah a pevnou paletu; testy: původní room comparator,
role a skutečná CML gateway; CI/build: stávající celý povinný plán;
dokumentace/pokyny: tento kontrakt; API/schémata/Android/hlas: beze změn;
fixtures: pouze izolované; překlady a další moduly: bez rozšíření.

Snídaně na telefonu používají původní plnošířkové dlaždice s číslem pokoje,
firmou, dietami, hosty, zemí, nocemi a věkovými skupinami strávníků.
Pozadí #ffffff a oranžová výdejní akce #ff6a2e zůstávají pevné, bez vlivu CML tématu.
Akce zachovává původní tmavé písmo #101010; u vydaného stavu se nesnižuje
opacity celé dlaždice. Zachování kontrastu má tuto výslovnou omezenou
odchylku od původního zeslabení. Backendové kontroly role,
času výdeje, očekávané verze a následné čtení zůstávají stejné.

Samostatný `cml-breakfast.browser.mjs` je součástí povinného původního
room browser gate. Ověřuje obsluhu snídaní, syntetický výdej a jeho verzi,
nulové porce, vydané/zrušené stavy, věkové počty, firmu, noci, skutečné
PNG, platné datum a nezávislost na CML tématu. Vlastnosti palety, hran
a tlačítka porovnává s vykreslenými původními CSS, nikoli s odhadem
z prvních proměnných. Místní Chrome/WebKit pokrývá 320/390/640 px.
