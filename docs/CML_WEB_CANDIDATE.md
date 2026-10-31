# KájovoHotel v CML – vývojový kandidát

Nový frontend vlastní tento repozitář v `apps/kajovo-hotel-api/app/web_ui/`. Jde o nový zdroj podle předlohy, bez přebírání původních UI komponent. Kandidát není produkční release a neodstraňuje původní browserové vstupy před ověřením nové cesty.

Native gateway `/cml-web/` vyžaduje explicitní veřejný JWKS v `CML_WEB_JWKS_PATH` a jednorázový desetisekundový CML podpis pro audience `hotel`. Ověřuje issuer, metodu, plnou cestu s query, tělo a CSRF. Nonce je trvalá přes migraci `0047_cml_web_nonce` a společná všem workerům. Neověřené hlavičky nedávají browseru žádnou identitu.

CML grant se protíná s aktuálním aktivním nativním účtem a přidělenými rolemi Hotelu. Volba role je přípustná jen z aktuálních přiřazených rolí. Hlavní účet zachovává původní technickou admin identitu serveru, aby se nepřerušila vazba historie, chatu a paměti. Provider credentials zůstávají pouze ve vlastním backendu.

Nové UI čte původní housekeeping, snídaňové, skladové, hlásicí a chatové kontrakty. Neověřený zápis se neopakuje automaticky. Samotná přítomnost obrazovky není uzavření jejího funkčního a vizuálního ověření.

Dosud není dokončené pokrytí všech předloh, lokalizací a funkcí, centrální správa účtů/rolí, převod identit, uzavření přímých browserových přihlášení ani hlasový chat v izolovaném kontextu. Opaque sandbox se nesmí zaměnit za ověřený mikrofonní přístup. Publikace na main, produkční nasazení a úplná přejímka zůstávají neprovedené. Nativní Android, strojová API a stávající hlasová implementace nebyly odstřiženy.

Centrální CML detail účtu používá původní Hotel API pro pracovní role a profil. CML routy `/api/v1/users` připouštějí pouze hlavní účet a pro zápis vyžadují podepsanou čerstvou reautentizaci. Lokální resetovací endpointy a heslo v JSON aktualizaci jsou odmítnuté. Nativní role se stále ověřují proti aktuálnímu Hotel účtu. Browserové ověření centrálního profilu proběhlo nad izolovaným původním API. Celý migrační cutover a produkční nasazení dosud nejsou provedené.

Aktuální podrobný místní rozsah a zbývající brány jsou v
[CML_UI_COMPLETION.md](CML_UI_COMPLETION.md). Deset hlavních pohledů již má
prohlížečovou kvalifikaci přes skutečnou CML gateway; toto ověření není úplným
pokrytím všech referencí, Docker releasem nebo produkčním cutoverem.

Nový atomický kontrakt `kajovo-profile-provision/1` vytváří vlastní pracovní
profil z centrálního CML průvodce. Podepsaný POST `/cml-web/api/profiles` přijímá
`operation_id`, `central_user_id` a původní profilová pole bez hesla/ID. Vyžaduje
hlavního vlastníka a čerstvé reauth; GET se stejným ID pouze čte účtenku a
aktuální profil. Pole navíc jsou odmítnutá. Účtenka obsahuje původní fingerprint,
centrální UUID a skutečné nativní ID, nikdy heslo. Jedinečné operace a centrální
UUID spolu s profilem vznikají jednou transakcí. Konflikt e-mailu nevytvoří
vazbu k cizímu účtu; změna argumentů stejného ID vrací konflikt. Smazání
pracovního profilu nemaže jeho účtenku a opakování jej nevytváří znovu.

CML nejprve trvale uloží rozepsaný neaktivní účet, poté vytvoří profily a po
nezávislém read-backu potvrdí vazby/granty. Pozvánku vydává až nad konečnou
revizí. Původní nativní credentials a neveboví klienti se nemění; tento kontrakt
nevolá původní nativní onboarding. Obnova nejisté žádosti nejprve čte původní
ID a případné pokračování je výslovné, nad stejným DB-only atomickým kontraktem.

Pro vlastní publikační řetězec je v hostovém Nginxu kandidátní route
`/cml-web/` → 8202 bez přepisu URI a s 8m limitem. Compose výslovně předá
`CML_WEB_JWKS_PATH`; produkční konfigurace musí ukázat na veřejný JWKS CML
v dostupném souboru, například `/app/data/cml-web-jwks.json` ve stávajícím
api_data volume. Soubor se připraví před startem kandidáta, bez změny starých
provider credentials nebo historických diagnostických volumes. Neobsahuje
privátní podpisový klíč. Bez této konfigurace je boundary uzavřená (503).

Samostatný lokální image a proxy test přes skutečný HTTPS Nginx/API ověřil
401 bez podpisu, 200 s platným podpisem, 401 při replay nonce a nové HTML
s `/sections/hotel/app.js`. Ověření používá jen syntetický veřejný JWKS,
izolovanou SQLite a nové kvalifikační image. Produkční Nginx ani kontejnery
nebyly tímto testem změněné; staré veřejné webové vstupy ještě nejsou uzavřené.

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
error-log profil zůstaly ověřené. Mikrofon se na starých admin stránkách
nepovoluje; nový hlasový frontend/broker v CML je samostatný otevřený gate.

Release gate má nově povinný krok `legacy-worker-retirement` (31 kroků celkem).
Úplný gate pro výhradní vstup prošel 31/31 na `bf8a610fba61` (504 API/Voice/Dagmar testů); následná změna push protokolu má vlastní novou kvalifikaci níže. Produkční konfigurace,
image ani relace tímto místním krokem nebyly změněny. Před finálním cutoverem
se znovu kvalifikují nativní WEB relace a nasazovací automatizace; Android
a vlastní obchodní/MCP identity nesmějí být hromadně odvolané.


## Soukromí webových oznámení

Migrace `0050_cml_web_push_authority` pouze přidává `cml_authorized=false` ke
všem stávajícím odběrům. Zachovává původní řádky, endpointy a klíče. Starý
odběr se nepoužije pro odesílání. Nové založení či opětovné povolení vyžaduje
podepsaný požadavek CML a aktuální lokální identitu; samotná nativní webová
cookie nestačí. Androidové FCM registrace a jejich worker se tímto nemění.

Provider dostává pouze uzavřený `kajovo-hotel-chat-signal/1`: `contract`,
`recipient_id`, `conversation_id`, `message_id`. Název odesílatele, e-mail,
text zprávy, URL ani vykreslitelný HTML obsah se do něj neposílají. Nový CML
worker před čtením a znovu před zobrazením ověří aktuální centrální relaci,
grant Hotelu, lokálního příjemce, veřejný push klíč a fingerprint celého
browserového odběru. Konkrétní zprávu načte původním čtecím API přes CML.
Nejde o callback s převzatou identitou vlastníka. Bez aktuálního oprávnění
nedostane obsah zprávy a oznámení nezobrazí. Náhled nemění potvrzení přečtení.

CML ukládá před pokusem o zobrazení vlastní jedinečnou účtenku do IndexedDB.
Souběžný/opakovaný signál ani nejasné potvrzení zobrazení se nezobrazují
znovu. Účtenka neobsahuje text, endpoint ani klíče. Chromium i WebKit ověřily
reálnou CML gateway, původní API, skutečné IndexedDB a module worker;
browserové Push/Notification API byly kontrolované adaptéry. Externí push
provider a doručení operačním systémem nebyly testované.

Bezpečný rollback zachovává migraci, filtr `cml_authorized` a obsahově prázdný
signál. Návrat ke starému senderu s textem zprávy nebo ignorování tohoto
příznaku není podporovaný. Při regresi lze ponechat webový push vypnutý,
nikoli obnovit starý sender; FCM zůstává samostatné. Migrace proto downgrade
odmítá. Test upgradu prokazuje byte-equivalentní hodnoty starých sloupců,
nový výchozí zákaz a zachování migrace po odmítnutém downgrade. Žádný z těchto
místních testů neměnil produkci nebo odesílal zprávy.


## Nový hlasový frontend a správa paměti

`app/web_ui/voice.js` je nově napsaný frontend; neimportuje původní browserový
hlasový runtime ani React komponenty. Má samostatný pohled hovoru, konfiguraci
z původního katalogu, paměti, textové/strukturované lístky a stručné souhrny.
Čte a mění původní Dagmar API, revize a vlastní úložiště či nakonfigurovaný MCP
adaptér. Původní profil identity Dagmar zůstává chráněný. Změna pošty či nová
aktivace M2M nejsou součástí těchto obrazovkových operací.

Hotelový infrastrukturní adaptér přijímá ověřenou CML identity state místo
požadavku na druhou hotelovou cookie. Nativní cookie větev se nemění. Hlasové
konfigurační/paměťové změny mají CML účtenku `voice:write`, vyžadující skutečný
lokální admin a aktivní admin roli. Účtenka neobsahuje vstupní klíč ani SDP.
Obnova používá pouze GET původního ID; následné načtení porovnává revizi a
obsah konkrétního záznamu. Rozepsaný formulář a nejistý původní pokus přežívají
přepnutí podsekce v témže nativním dokumentu. Reload celého dokumentu není
zárukou uchování rozpracovaného textu.

Společný CML dokument vlastní nový typovaný mikrofonní bridge. Opaque rámec
nedostane stream, SDP, provider klíč ani libovolnou API cestu. Řadič ověřuje
čerstvou hlavní relaci, grant, nativní admin identitu a explicitní připravenost
serveru před vyžádáním mikrofonu. Ukončení uvolňuje i mikrofon/peer čekající
na odpověď; pozdní identifikátory se uklidí jednou. Nejasné vytvoření se
neopakuje. Místní testy řadiče používají fake media/peer/poskytovatele.

Aktivace nových hlasových přístupů zůstává podle konkrétního `AGENTS.md`
odložená. Dynamický manifest proto uvádí `voice.enabled=false`; podepsané
CML vytvoření/změna call/session vrací `voice_cml_activation_deferred` ještě
před alokací logického hovoru nebo provider voláním. UI ukazuje skutečný
neaktivní stav. Nejde o potvrzenou funkční přejímku hlasového hovoru, WebRTC,
zvuku, M2M schopností nebo doručení pošty. Původní nativní/backendový hlasový
lifetime se neaktivuje ani nepřepisuje jako náhradní přihlášení.

Chromium a WebKit kvalifikovaly oba původní management API přes skutečnou CML
gateway, šířky 1920/834/390, jediné uložení po ztracené odpovědi konfigurace,
syntetického klíče a paměti, uchování původní účtenky po navigaci, revizní
úpravu paměti a vytvoření/úpravu/přesun/odebrání/vyprázdnění/archivaci/smazání
syntetického seznamu. Snímky byly vizuálně prohlédnuté; úplné porovnání všech
referencí, včetně inline nového formuláře přehledu, zůstává otevřené. Žádné
skutečné klíče, mikrofon, placené nebo produkční obchodní účinky nebyly použité.
