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
