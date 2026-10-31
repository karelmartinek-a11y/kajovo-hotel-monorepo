# Doplnění nového Hotel UI

Nové UI ve `app/web_ui` se doplňuje proti skutečným API a dodaným PNG. Původní
frontendové komponenty ani jejich implementace se nepoužívají. Produkční baseline
zůstává `11cde6c60768ebec9eaa31788c524aef73e1c19f`; lokální rozšíření není release.

| Oblast | Dopad |
| --- | --- |
| Nový frontend a manifest | Doplnit chybějící pracovní toky a grafické stavy |
| Obchodní služby/API/Android | Zachovat původní data, výpočty a spotřebitele |
| CML boundary a migrace | Přidat vlastní trvalé identity webových zápisů a čtecí obnovu |
| Testy a fixtures | Skutečné routery nad izolovaným stavem, fake poskytovatelé, zákaz externí sítě |
| Build, CI a dokumentace | Zapojit nové JS kontroly, migraci, manifest a kvalifikaci |
| Auth, role a secrets | Aktuální lokální identita a oprávnění před čtením původního výsledku |
| Hlas a paměť | Zachovat backend; nový frontend vyžaduje samostatné zapojení a mikrofonní ověření |
| Produkce a publikace | Až po funkčních, vizuálních a bezpečnostních branách celé integrace |

Webový zápis s `Idempotency-Key` se před předáním původnímu routeru trvale
rezervuje ve vlastní databázi Hotelu. Opakování nemůže znovu vykonat původní
router. Potvrzení ukládá původní HTTP stav a JSON výsledek; čtení výsledku znovu
ověřuje aktuální identitu a původní oprávnění. Selhání mezi obchodním účinkem a
potvrzením zůstává nejistotou. Neexistuje automatický replay ani obnovování DB.
Původní nativní/strojové endpointy se tímto obalem nevedou.

## Místně ověřený rozsah

Nové UI poskytuje deset hlavních administrátorských pohledů. Přehled čte původní
API; neověřená metrika zůstává neověřená a skladové jednotky se nesčítají napříč
různými jednotkami. Sklad má příjem, výdej a odpis s původní historií pohybů.
Formuláře uchovávají přijatý výsledek odděleně od následného čtení. Ztracená
odpověď nevyvolá druhé vytvoření ani nový poskytovatelský příkaz. Přepnutí
podsekce nezahodí otevřený formulář ani jeho původní lokální roli.

Manifest rozlišuje administrátorské a zaměstnanecké reference, hlavní názvy od
navigačních popisků a deklarované dialogy pro přesnou kontextovou nápovědu.
Nativní aktuální oprávnění se stále ověřuje pro každou operaci; sjednocená nabídka
více rolí není rozšířením jedné aktivní API role. SMTP formulář používá původní
Hotel konfiguraci a šifrování. Uložené heslo se nečte do prohlížeče. Nejasná změna
hesla není vydávána za ověřené připojení a test e-mailu je samostatná uživatelská akce.
Při kvalifikaci se žádný skutečný e-mail neodesílá.

Backend: 374 úspěšných API testů včetně aditivní migrace, zachování starých řádků,
nevratnosti identit, souběžného přijetí ve dvou workerech a revokace oprávnění.
Dva JS testy řeší pražský jarní neexistující čas a obě podzimní instance.
Samostatná kontrola parsuje všechny nové JS moduly a ověřuje manifest obou rolí;
release gate zahrnuje obě kontroly a jeho dosavadních jedenáct testů prošlo.
Úplný lint Python aplikace a API testů a scan celého aplikačního zdroje prošly.

Chromium i WebKit kvalifikují deset hlavních pohledů při 1920/834/390 px,
izolaci od parent DOM, původní identitu po ztracené odpovědi, následné ověření
úpravy, tři skladové pohyby, úklid s jediným fake poskytovatelským zápisem,
uložení SMTP konfigurace bez SMTP volání a zaměstnance s více skutečnými rolemi.
Pokus použít nepřiřazenou roli admin je odmítnutý. Integrační scénář je
`tests/library/hotel-ui.browser.mjs` v samostatném CML repozitáři.

## Další ověřený lokální krok: pracovní stránky, snídaně a média

Snídaně mají tabulkový denní přehled a samostatný formulář i detail podle
předlohy. Diety pracují s původní verzí konkrétního pobytu, včetně jeho dalších
snídaňových dnů. Výdej a vrácení používají původní časové/rolové podmínky.
Administrátorská reaktivace výdeje, smazání vybraného období a jednotlivého
záznamu byly ověřeny čtením izolované DB; mazání celého dne má vlastní původní
endpoint a UI, browserová kvalifikace této konkrétní větve ještě zbývá.

Hlášení, závady, nálezy a sklad mají samostatné stránky pro vytvoření, úpravu a
detail; rozpracované formuláře se uchovávají v paměti dokumentu. Skladový stav
není při úpravě katalogu editovatelný a neposílá se v update payloadu. Nadále se
mění původními pohyby. Nálezy respektují omezení recepce na zpracování; mazání
nálezu i závady je pouze administrátorské. Role s právem pouze vytvářet bez práva
číst (pokojská) mají vlastní tok potvrzení přes uloženou odpověď svého zápisu.
Vlastní pokojská tedy může vytvořit závadu i nález a připojit fotografie. Čtení
seznamu, cizího i vlastního aktuálního detailu a fotografie dále vrací 403.
Potvrzovací stránka zobrazuje výslovně původní přijaté údaje, nikoli pozdější stav
evidence. Nepřidává se jí čtecí grant ani nová role.

Fotodokumentace používá původní multipart API a originální soubory. Nahrání po
ztrátě odpovědi se obnoví pouze čtením trvalého výsledku. Formulář drží původní
roli i nevyřízený pokus při přepnutí stránky. Náhledy se načítají autorizovaným
fetch a blob URL se uvolňují. Původní foto GETy mají aditivní parametr `download`
(výchozí false), který pouze vrací soubor jako přílohu. Browserový test porovnává
bajty staženého originálu s přesným vstupem. Oba původní PDF exporty jsou přímé
GET odkazy přes CML, se zachovaným názvem i bajty a čerstvou autorizací.

Zvolený den snídaní se uchovává v sessionStorage hlavního dokumentu přes úzký
bridge `date`, deklarovaný manifestem. Rámec nemůže vybrat cestu ve storage ani
číst libovolný klíč. Namespace zahrnuje přihlášený účet a konkrétní sekci. Stav
neobsahuje credentials, záznamy, rozpracované zápisy ani neprodlužuje přihlášení.
Odpovědi jsou vázané na aktuální parent/frame, origin, prefix a UUID požadavku.

Chromium i WebKit procházejí hlavní pohledy i vytváření, úpravy a detaily čtyř
evidencí při 1920/834/390 px. Navíc ověřují snídaně, ztracenou odpověď u diety i
fotografie, dekódovaný náhled/zvětšení, shodu původního obrázku a PDF a zvolený
den po reloadu. Fixture nepřehrává WebKit multipart přes `route.fetch` (ten
předával prázdný soubor); ztrátu ACK injektuje až za skutečně dokončenou boundary,
po původním browserovém uploadu a commitu receipt. Kontroluje se jediná fotografie
a trvalý původní výsledek. Všechny údaje a poskytovatelé zůstávají syntetičtí. Nahrání a přesné stažení
originálu je ověřené pro hlášení, závady i nálezy. Tok pokojské zahrnuje ztracenou
odpověď při vytvoření i fotografiích a nezávislé ověření jediného DB záznamu /
jediné přílohy. Původní oprávnění Hotelu zůstávají beze změny.

Python API sada znovu prošla 374/374 testy (268 dosavadních FastAPI on_event
warnings). Kontrola JS parsuje 13 nových modulů. Centrální CML sada prošla 26
testy včetně dvou testů izolace deklarovaného UI data. Dva časové JS a jedenáct
release-gate unit testů prošly. Gitleaks nad celým aplikačním zdrojem nevyžadoval
žádnou výjimku.

## Skladové doklady, piktogramy a skutečné transakce PostgreSQL

Nový skladový přehled má šest sloupců předlohy, správné základní jednotky,
podmíněnou zásobu pod minimem a sbalené filtry. Nový pohyb skladu je původní
vícerádkový doklad (příjem/výdej/odpis), s vlastními řádky, kusy, datem,
dodavatelem, referencí a poznámkami. Formulář zachovává původní roli i rozpracované
hodnoty při přepnutí. Před odesláním sčítá shodné položky; následné čtení kontroluje
původní doklad i odpovídající pohyby. K dispozici jsou seznam a detail dokladů,
historie všech pohybů a administrátorské smazání dokladu s ověřením kompenzace.
Skladník nevidí mazání původních položek, pohybů ani dokladů, které API dovoluje
pouze správci. Původní jednotlivé pohyby zůstávají dostupné z detailu položky.

Piktogram používá původní multipart endpoint, chráněný náhled a původní soubor.
Výsledek se ověřuje čtením aktuální vazby, velikostí a SHA-256 originálních bajtů
oproti vybranému souboru (pouze v paměti prohlížeče). Nový volitelný `download`
parametr původního pictogram GET zachovává výchozí chování a umožňuje attachment.
Nejasný upload nepřidává druhý obrázek; formulář drží původní ID a čtecí obnovu.

Při napojování byl prokázán starší backendový defekt: dva řádky shodné suroviny
7+6 mohly vydat nebo odepsat 13 při zásobě 12. Nový regresní test původně selhal
pro oba typy (201 místo 400). API nyní ověřuje součet celého dokladu ještě před
vytvořením. V PostgreSQL se dotčené skladové řádky zamykají v pořadí primárních
klíčů; stejného zámku se účastní doklady, samostatné pohyby i jejich mazání.
Číselná řada původního prefixu a roku má transakční advisory lock i mezi doklady
různých položek. Mazání nejprve zamyká vlastní doklad, aby dvojí souběžná kompenzace
nemohla vrátit zásobu dvakrát. Žádná nová datová tabulka ani migrace není potřeba.

Ověření: celá API sada 381 PASS / 0 skipped, včetně čtyř skutečných PostgreSQL
scénářů (souběžné doklady na jednu zásobu; doklad proti jednotlivému pohybu;
osm současných dokladů různých položek a společná číselná řada; dvojí smazání).
Lokální databáze je samostatná `cml_hotel_inventory_test`; každý případ vytvoří
a uklidí jen vlastní náhodné schema s pěti skladovými tabulkami. Bez explicitní
lokální testovací URL je PG sada označená skipped, nikoli vydávaná za PASS. CI
job `validate` nyní poskytuje PostgreSQL 16.15 a tuto URL celé povinné sadě,
takže tyto testy v CI nevynechává. Samotný nový workflow zatím nebyl spuštěn
na GitHubu. Neproběhla produkční změna databáze, účtů ani skladových položek.

Po aditivní změně piktogram downloadu znovu prošlo devět původních a nových
skladových API testů. Syntaxe nyní parsuje 14 nových modulů. Gitleaks nad celým
aplikačním zdrojem a novým CI/test kontextem prošel bez allowlistu.

Browserová kvalifikace zahrnuje ztrátu potvrzení vytvoření i smazání dokladu,
jediné DELETE, řádky shodné položky, jejich součet, původní pohyby, kompenzovaný
stav, skutečně dekódovaný piktogram i shodu stažených bajtů. Ve WebKitu byl
opraven posun čtecí obnovy pod fixní záhlaví: připojený formulář posune obnovu
do středu a fokusuje její tlačítko, bez vynucování kliknutí v testu. Při opuštění
stránky se odpojený formulář nefokusuje. Zobrazení filtrů bylo ověřeno hledáním
a kombinací s limitem zásoby. Plné screenshoty se pořizují od začátku dokumentu,
aby se pevné záhlaví neobjevovalo uprostřed exportu dlouhé stránky.

## Neuzavřené části

Zbývá úplná matice 111 předloh a všech jejich chybových stavů, přesné lokální
překlady, zbývající snídaňové operace a všechny okrajové/rolové stavy, živé doručení oznámení a hlas.
Hlas dosud nemá ověřený mikrofon v opaque rámci. Přímé browserové přihlášení
není odstřižené a nový převod identit není provedený v produkci. Centrální životní
cyklus nových profilů/pozvánek a širší členské granty mají vlastní společné brány.

Obnova webového výsledku nyní vyžaduje jeho původní ID; objevování nedokončených
pokusů po úplném znovunačtení dokumentu není tímto checkpointem kvalifikované.
Obecná databázová nebo poskytovatelská chyba zůstává nejistá. Uložená původní
HTTP chyba nikdy není označena jako potvrzení, že obchodní účinek nenastal.

Publikace GitHub main, plné CI, produkční build/rollout a živá přejímka celé
integrace zůstávají neprovedené. Staré browserové vstupy ani nativní Android
nebyly tímto checkpointem vypnuté. Nebyla založena žádná firma ani agentura.

## Soukromý Chat a CML upozornění – místní kvalifikace

Patnáctý nový modul realizuje soukromé konverzace nad původními tabulkami
a endpointy. Původní UI nebylo kopírované. Přidaný sender-bound GET výsledku
`client_message_id` nikdy nevytváří účastníka, zprávu ani stav přečtení.
Nenalezený výsledek se neinterpretuje jako nepotvrzené neodeslání. ASC kurzor
`after_id` doplňuje původní stránkování `before_id` a nevypouští příchozí bloky
větší než jednu stránku. Žádný nejistý POST se automaticky neopakuje.

Chromium i WebKit ověřily původní API a izolovanou DB: 61 zpráv se starší historií,
rozpracovaný text i kurzor během obnovování, přepnutí podsekce při ztracené
odpovědi, jedinou uloženou zprávu a jedinou frontovou položku, 125 dalších
zpráv bez vynechání, obnovu konverzace bez druhého POST a odmítnutí cizího
výsledku i konverzace. Zobrazení má samostatné snímky při 1920/834/390 px.
Tato kvalifikace nenahrazuje úplné vizuální porovnání všech předloh.

Upozornění používají původní subscription API, čtecí stav otisku celého odběru
a canonical `participant_id`. WebPush payload nově obsahuje příjemce; FCM
kontrakt a provider granty se nemění. CML zajišťuje opt-in, vlastní úzce omezený
worker a kontrolu účtu/příjemce/odběru před zobrazením. Browser testy obou enginů
potvrdily skutečný CML bridge, IndexedDB, Hotel zápis a čtecí obnovu po ztraceném
ACK i skutečnou instalaci module workeru bez převzetí hlavní stránky. PushManager
a systémové oprávnění používají řízené adaptéry. Externí push a OS doručení
nebyly provedené; produkční konfigurace ani žádná skutečná zpráva se neměnila.

Celá API sada: 385 PASS / 0 skipped, 268 dosavadních FastAPI deprecation warnings.
OpenAPI a sdílený TS klient jsou znovu generované z tohoto API. Povinný Python lint
používá přesné parametry CI (`E,F`, existující `E501` ignore); syntaxe 15 modulů
a oba testy pražských datumů prošly. Plné CI a produkční build nadále chybí.

Povinný textový kontrolor při prvním úplném gate chybně odmítal platné JS
ternární výrazy a query literály. Nyní u JS/TS/JSON posuzuje skutečné quoted
literály a JSX text; kontroly poškozených Unicode sekvencí nad celými soubory
zůstávají zachované. Dva regresní testy zahrnují původní platné případy i
poškozený český text vedle platného API volání. Oba běží v release planu.
Samostatné copy-out instalace Dagmar a Voice Core prošly s vyhrazeným místním
pnpm store; globální uživatelský store nebyl měněn. Úplný místní gate následně prošel na
`067734b67819e9d304545ecfb1648d367bd1db0d`: všech 30 kontrol PASS, včetně
obou copy-out sestavení, kontraktů, obou web buildů, Android policy a původních
reálných browserových baseline/voice-memory/voice-lifecycle/voice UI testů.
Lokální JSON artefakt je `release-gate-067734b67819-20261031T072735.449360+0000.json`.
GitHub CI, výsledný produkční image a nasazení tím nejsou doložené.

Chat nyní drží dlouhou historii ve vnitřním posuvném panelu; vlastní zprávy
zůstávají vpravo. Původní negativní test prokázal čtení příchozích zpráv pod
otevřeným dialogem. Oprava blokuje read-through při nativním dialogu a CML
předává nulovou viditelnou výšku při překrytí hlavním dialogem. Chromium i
WebKit následně ověřily 125 příchozích zpráv, skutečně posuvnou historii,
žádné potvrzení pod oběma dialogy a obnovení čtení po zavření. Izolované
syntetické testy neposlaly skutečnou zprávu. Úplný release gate výše předchází
této opravě; před vydáním musí znovu projít nad výsledným zdrojem.

Nová migrace 0049 má vlastní regresi zachování všech původních sloupců,
uživatele a jeho účtenky při odmítnutí downgradu. Samostatná regrese 0048
zůstává zaměřená na tuto konkrétní původní migraci. Šest migračních testů
prošlo. Úplný místní gate nad `931b602d2b7a` nyní prošel všemi 30 kontrolami,
včetně 504 společných API/Voice Core/Dagmar testů (270 dosavadních warnings),
obou copy-out instalací a sestavení, skutečných webových/hlasových regresí
a kontraktů. Artefakt je `release-gate-931b602d2b7a-20261031T100659.703806+0000.json`.
Samostatné Docker buildy API/admin/web a skutečný proxy runtime test také
prošly včetně CML podpisu, odmítnutí nepodepsané žádosti a nonce replaye.
GitHub CI a výsledný produkční image/nasazení nadále nejsou provedené.

## Výhradní nový webový vstup – místní kandidát 31. 10. 2026

Web/admin runtime image již nesestavuje ani nekopíruje původní React/Vite UI,
brand ani login stránky. Nové obsahové moduly zůstávají pouze v podepsaném
API `app/web_ui`. Staré dokumentové vstupy vracejí pevné 302 do
`https://kajovocml.hcasc.cz/#hotel`, bez přenosu původního query nebo tokenu.
Staré assets a web manifest vracejí 410. Nativní `/api/` a přesný existující
Android download zůstávají zachované; runtime test ověřuje shodný SHA-256
APK s původním release manifestem. Mobilní deep link `/login/reset` zůstává
původním Android intentem; browserový fallback vede do CML.

Tři známé staré worker URL dodávají nový krátký retirement worker. Ten
ukončí jen vlastní PushSubscription, zavře vlastní oznámení a odregistruje
sám sebe; nedispatchuje požadavky, zprávy nebo navigace a nesahá na cizí
registrace či cache. Původní worker neměl fetch/cache vrstvu. Tři VM testy
ověřily normální i offline větve. Skutečné Chromium a WebKit kvalifikovaly
aktivaci a odregistrování root/admin scope se zachováním vedlejší registrace
a cache; žádné skutečné zprávy ani provider volání. Nový CML push broker
zůstává samostatný a vyžaduje vlastní aktivní účet, grant a gesture.

Nové web/admin image prošly skutečnou HTTPS host→Nginx→API cestou: pevné
redirecty, 410 starých assets, byte-identický nový worker na všech třech URL,
nezměněné APK, platná podepsaná identita/nové JS a odmítnutí unsigned/replay.
Bezpečnostní hlavičky, obsahově prázdný access audit a původní diagnostický
error-log profil zůstaly ověřené. Tento starší retirement výsledek není po vyjmutí hlasu způsobilý k nasazení;
aktuální brána musí zachovat původní samostatný hlasový vstup.

Release gate má nově povinný krok `legacy-worker-retirement` (31 kroků celkem).
Úplný gate nad touto novou revizí ještě následuje. Produkční konfigurace,
image ani relace tímto místním krokem nebyly změněny. Před finálním cutoverem
se znovu kvalifikují nativní WEB relace a nasazovací automatizace; Android
a vlastní obchodní/MCP identity nesmějí být hromadně odvolané.

Úplný gate výhradního vstupu nad `bf8a610fba61` prošel 31/31 kroky.
Společná backendová suite má nadále 504 PASS (270 dosavadních warnings),
nový povinný worker krok má tři PASS. Artefakt:
`release-gate-bf8a610fba61-20261031T114544.652259+0000.json`.
Předchozí místní pokus používal neinstalovaný výchozí PostgreSQL ovladač;
finální běh používá explicitní `postgresql+psycopg` URL obou vlastních
local-only test DB proměnných. Produkční a GitHub kroky stále neproběhly;
zachování původního samostatného hlasu a finální grafická řada zůstávají otevřené.


## Soukromý push – úplný lokální gate

Runtime revize `53d6cd387861` prošla 31/31 kontrolami release gate, včetně
506 API/Voice/Dagmar testů (270 upozornění původních závislostí), obou
copy-out hostů, původních UI regresí a retirement workeru. Artefakt:
`release-gate-53d6cd387861-20261031T124216.117369+0000.json`.
Cílených 16 testů zahrnulo nedestruktivní migraci a zavřený provider payload.
Chromium a WebKit přes skutečnou CML gateway kvalifikovaly náhled z původního
čtecího API, IndexedDB deduplikaci po souběhu/obnově a nulovou změnu potvrzení
přečtení. Push/Notification API byla řízená; externí push ani OS doručení
nebyly testované. GitHub publikace a produkční cutover zůstávají otevřené.


## Hlas mimo integraci CML

Uživatel výslovně zrušil celou integraci hlasu. Platí
[CML_VOICE_AUTHORITY.md](CML_VOICE_AUTHORITY.md): původní hlasová stránka,
přihlášení a backend se zachovají, nové CML UI/autorita/migrace jsou odstraněné.
Starší retirement důkazy výše neověřují tuto výjimku a nejsou aktuální
kvalifikací přechodu. Nová kvalifikace musí ověřit původní samostatný vstup
přes skutečné frontend/API image a HTTPS proxy bez placeného hovoru.

## Potvrzení připraveného vybavení a smazání snídaní dne

Nový detail pokoje potvrzuje pouze skutečně natíženého psa/postýlku původním
`requirements/{kind}/confirm` API. Zachycuje původní pokoj, pobyt, den, množství,
verzi i pracovní roli. Původní odpověď a následný přehled musí potvrdit aktivní
zelený stav a odpovídající verzi; neexistující příznak `confirmed` se nepoužívá.
Potvrzené vybavení zůstává připravené po reloadu a další potvrzení nenabízí.
Při ztrátě ACK nebo následného čtení `saveMutation` pouze načte původní
účtenku/stav a nikdy znovu neposílá změnu.

Chromium a WebKit přes skutečnou lokální CML gateway reprodukovaly původní
chybějící obnovu a poté ověřily oba typy vybavení: jeden POST na každý typ,
verze 1 a přesně dvě původní auditní události. Provider zápisy se nezvýšily.
Další scénář po explicitním potvrzení smazal snídaně jediného vybraného dne,
ztratil odpověď, obnovil původní výsledek bez druhého DELETE a po reloadu
porovnal všechny záznamy ostatních dnů s původním snímkem. Všechny údaje byly
syntetické v izolované DB; produkční rezervace, natížení ani snídaně se neměnily.

Cílených 111 backendových testů prošlo s vlastními checkouty balíčků
`packages/voice-core-server/src` a `packages/dagmar-server/src` v PYTHONPATH.
Původní pokus s adresáři bez `/src` načetl jiný nainstalovaný Dagmar balíček
a skončil při setupu; tento běh nebyl úspěšnou kvalifikací.

Konečný úplný gate na revizi `67ce22885bf6` má 31/31 PASS a 509 úspěšných
API/VoiceCore/Dagmar testů bez přeskočení (270 upozornění). Artefakt:
`release-gate-67ce22885bf6-20261031T144517.002508+0000.json`.
Reprodukce vyžaduje absolutní PYTHONPATH do tří vlastních zdrojových checkoutů,
lokální `HOTEL_INVENTORY_TEST_DATABASE_URL` a `CML_PROFILE_TEST_DATABASE_URL`
s ovladačem `postgresql+psycopg` a vlastní `npm_config_store_dir` pro pnpm.
Předchozí gate skončil na neplatné globální cache pnpm; nebyl vykázán jako PASS.
Tato kvalifikace je lokální, publikace a produkční cutover nadále neproběhly.

## Aktuální výjimka pro původní hlas

Lokální HTTPS proxy kvalifikace zachování původní hlasové stránky, loginu,
assets, brandu a mikrofonní policy prošla. Nový CML hlas není součástí
kandidáta. Platný rozsah, důkazy a limity viz
[CML_VOICE_AUTHORITY.md](CML_VOICE_AUTHORITY.md). Tento místní průchod není
produkční nasazení nebo přejímka hovoru.
