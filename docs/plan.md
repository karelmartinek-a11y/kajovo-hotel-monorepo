# Plan Odstraneni Mocku, Simulaci a Placeholderu

## Ucel

Tento plan shrnuje postup, jak z runtime aplikace odstranit vsechny zbytky mock chovani, simulaci pohledu, fallback identit, placeholder textu a bootstrap mechanizmů, ktere mohou zkreslovat realny provoz systemu. Plan je rozdeleny podle oblasti uzivatelskeho rozhrani a serazen podle doporuceneho poradi implementace.

## Vyklad pojmu pro tento plan

- `mock`: kod, ktery predstira realnou operaci bez skutecneho provedeni
- `simulace`: zamerne prepinani stavu nebo role bez realneho backend stavu
- `placeholder`: docasny text, fallback obsah nebo zjednoduseny vystup misto finalni logiky
- `bootstrap`: automaticke predvyplneni nebo naseti defaultnich dat, ktere neni soucasti bezneho provozu

## Implementacni poradi

1. Autentizace a identita
2. SMTP a komunikace
3. Admin shell a prepinace pohledu
4. Portal shell a prepinace pohledu
5. Modul Skladove hospodarstvi
6. Modul Snidane
7. Modul Ztraty a nalezy
8. Modul Zavady
9. Profil a Uzivatele
10. Cisteni test hooku z produkcnich bundle
11. Zaverecna verifikace a anti-regresni gate

## 1. Autentizace a Identita

### Rozsah UI

- portal web
- admin web
- backend RBAC a identity parsing

### Co odstranit

- fallback profil `anonymous/recepce` v portal klientu
- fallback identitu `anonymous, anonymous, recepce` v backend `parse_identity`
- vsechny stavy, kde se pri chybe auth vykresli aplikace s vymyslenou identitou misto tvrdeho `unauthenticated`

### Implementace

- v portal klientu nahradit `fallbackAuth` explicitnim stavem `unauthenticated` nebo `error`
- v backendu vratit pri chybejici session jednoznacnou auth chybu misto nahradni identity
- zkontrolovat, ze zadny route guard nepredpoklada simulovanou recepci jako nouzovy rezim
- sjednotit behavior mezi `apps/kajovo-hotel-web`, `apps/kajovo-hotel-admin` a `apps/kajovo-hotel-api`

### Hotovo, kdyz

- zadny klient nevyrabi fake profil
- backend nevyrabi fake identitu
- neautorizovany uzivatel vzdy skonci na loginu nebo access denied stavu

## 2. SMTP a Komunikace

### Rozsah UI

- admin `Nastaveni`
- backend mail service

### Co odstranit

- runtime `MockEmailService` jako vychozi provozni rezim
- zavadejici uspechove hlasky v adminu pri `delivery_mode = mock`
- placeholder potvrzeni, ktera tvrdi realne doruceni bez skutecneho odeslani

### Implementace

- oddelit vyvojovy mock od produkcniho kodu tak, aby produkce bez SMTP konfigurace selhala transparentne a nepredstirala odeslani
- v admin UI zobrazit odlisne stavy:
  - `SMTP neni aktivni`
  - `SMTP je aktivni, ale test selhal`
  - `SMTP test probehl a zprava byla skutecne odeslana`
- doplnit explicitni backend signal, zda doslo k realnemu navazani SMTP spojeni a realnemu pokusu o odeslani
- zakazat texty typu `Testovaci e-mail byl odeslan`, pokud slo jen o mock nebo dry-run

### Hotovo, kdyz

- uzivatel nikdy neuvidi uspech, pokud neprobehlo realne odeslani
- mock rezim nebude soucasti produkcniho chovani

## 3. Admin Shell a Prepinace Pohledu

### Rozsah UI

- admin horni menu
- role selector
- interni state switchery a QA markery

### Co odstranit

- `kajovo_admin_role_view` simulaci v `sessionStorage`, pokud neni vylozene soucasti schvalene funkcionality
- interni `StateSwitcher` a `StateMarker` prvky mimo test/build-only kontext
- vsechny admin-only query parametr mechanizmy pro umele stavy obrazovek

### Implementace

- rozhodnout, zda role selector ma byt:
  - produkcni funkce pro admin audit
  - nebo pouze test/QA nastroj
- pokud jde o QA nastroj, presunout jej mimo produkcni bundle
- `useViewState()` a podobne hooky prevest za build-time feature flag, ktera nebude dostupna v produkci
- odstranit jakykoli UI prvek, ktery umi menit stav stranky bez realnych dat

### Hotovo, kdyz

- admin shell v produkci neobsahuje interni simulator pohledu
- zadny query parametr `state` nezmeni produkcni obrazovku do nerealneho stavu

## 4. Portal Shell a Prepinace Pohledu

### Rozsah UI

- portal navigace
- role/zobrazeni podle prihlasene identity
- runtime test nav hooky

### Co odstranit

- `StateSwitcher`, `StateMarker`, `useViewState` v produkcnim chovani
- `window.__KAJOVO_TEST_NAV__` injekcni hook z produkcnich bundle
- jakykoli fallback routing, ktery sklada modulovou navigaci z testovacich hooku

### Implementace

- oddelit test navigaci do Playwright-only nebo dev-only adapteru
- ponechat v produkci pouze navigaci generovanou z realnych modulu a prav
- vynutit, ze klient bez identity nema funkcni modulovou navigaci

### Hotovo, kdyz

- produkcni portal nepouziva zadne globalni test hooky
- navigace odpovida pouze realnym rolím a realnym datum

## 5. Modul Skladove Hospodarstvi

### Rozsah UI

- admin sklad
- portal sklad
- detail skladove polozky
- inventurni protokol

### Co odstranit

- `seed-defaults` jako bezna provozni akce z UI
- hardcoded default katalog polozek, pokud nema byt soucasti jednorazove inicializace
- placeholder a bootstrap workflow, ktere predstira pripraveny sklad bez skutecneho zavedení dat

### Implementace

- presunout `seed-defaults` do jednorazove inicializace systemu, migrace nebo explicitniho admin setup kroku mimo bezny provoz
- v produkci skryt bootstrap tlacitka a endpointy, pokud nejsou opravdu soucasti obchodniho procesu
- zajistit, ze prazdny sklad je legitimni stav, ne duvod pro umele doplneni katalogu

### Hotovo, kdyz

- sklad neobsahuje demo/bootstrap akce v beznem admin pohledu
- prazdny sklad i novy sklad jsou obslouzeny realnymi prazdnymi stavy

## 6. Modul Snidane

### Rozsah UI

- denni prehled
- zadavani pokoju a poctu snidani
- admin role-view na snidanich

### Co odstranit

- placeholder denni prehledy nebo staticke ukazky bez realnych dat
- zobrazeni zaznamu s nulovou hodnotou jako by slo o skutecnou objednavku

### Implementace

- vynutit, ze prehled vzdy odpovida realnym zaznamum backendu
- ponechat pouze skutecne aktivni snidane, `0` nikdy nezobrazovat
- overit, ze pro prazdny den se zobrazi cisty prazdny stav, ne demo obsah

### Hotovo, kdyz

- neexistuje zadna staticka nebo demo verze denniho prehledu
- vsechny hodnoty v prehledu odpovidaji backend datum

## 7. Modul Ztraty a Nalezy

### Rozsah UI

- seznam
- detail
- prazdny stav

### Co odstranit

- placeholder empty-state texty, ktere nejsou navazane na realny backend stav
- umele test stavy v routach

### Implementace

- sjednotit prazdny stav s realnym `0 items` response
- odstranit view-state injekce, ktere umi vykreslit prazdny/chybovy stav bez backendu
- zajistit, ze seznam a detail vychazeji jen z realnych API odpovedi

### Hotovo, kdyz

- prazdny stav je jen nasledkem prazdnych dat
- chybovy stav je jen nasledkem realne chyby

## 8. Modul Zavady

### Rozsah UI

- seznam zavad
- detail zavady
- workflow zmeny stavu

### Co odstranit

- placeholder workflow stavy
- simulovane progress/marker stavy bez backend mutace

### Implementace

- provest stejny audit jako u ztrat a nalezu
- odstranit pripadne local-only transitions a test state hooky
- overit, ze vsechny zmeny stavu jsou zapisovane pres API a nasledne znovu nacitane

### Hotovo, kdyz

- zadna obrazovka zavady neumi predstirat stav bez backend potvrzeni

## 9. Profil a Uzivatele

### Rozsah UI

- admin profil
- portal profil
- seznam uzivatelu

### Co odstranit

- placeholder profilove karty
- fallback profily nebo local-only nacitani bez API

### Implementace

- zkontrolovat, ze profilove stranky pracuji jen nad realnym self-service endpointem
- odstranit vsechny lokalne vymyslene hodnoty pro jmeno, roli, email nebo metadata
- u uzivatelu zamezit renderu fake uctu mimo seed/migracni fazi

### Hotovo, kdyz

- profil bez API odpovedi nic nepredstira
- uzivatele na strance odpovidaji pouze databazi

## 10. Cisteni Test Hooku z Produkcnich Bundle

### Rozsah UI

- admin klient
- portal klient
- build konfigurace

### Co odstranit

- `window.__KAJOVO_TEST_NAV__`
- query-param state prepinace
- QA runtime helpery a markery
- globalni test adaptery, pokud unikaji do produkce

### Implementace

- presunout test hooky do:
  - Playwright fixture
  - dev-only importu
  - build-time podminky, ktere produkcni build vylouci z bundlu
- doplnit kontrolu velikosti a obsahu produkcnich bundle
- pridat grep gate na zakazane runtime tokeny:
  - `__KAJOVO_TEST_NAV__`
  - `StateSwitcher`
  - `StateMarker`
  - `fallbackAuth`
  - `MockEmailService` v produkcnim chovani

### Hotovo, kdyz

- produkcni assety neobsahuji test hooky
- grep gate pada pri jejich navratu

## 11. Zaverecna Verifikace a Anti-Regresni Gate

### Overeni po kazde vlne

- lint
- build pro admin i portal
- API testy
- Playwright smoke pro vsechny hlavni pohledy
- grep audit produkcnich bundle a server side kodu

### Povinne anti-regresni kontroly

- test, ze klient bez session skonci na loginu, ne na fake recepci
- test, ze SMTP uspech bez realneho send attempt neni mozne zobrazit jako doruceno
- test, ze `state=` query parametr v produkci nic neprepina
- test, ze produkcni bundle neobsahuje `__KAJOVO_TEST_NAV__`
- test, ze bootstrap skladu neni dostupny v beznem provoznim UI

## Doporucena realizacni vlna

### Vlna 1

- autentizace a identita
- SMTP a komunikace
- cisteni test hooku z produkcnich bundle

### Vlna 2

- admin shell a prepinace pohledu
- portal shell a prepinace pohledu
- profil a uzivatele

### Vlna 3

- skladove hospodarstvi
- snidane
- ztraty a nalezy
- zavady

### Vlna 4

- zaverecne bundle audity
- live smoke overeni
- CI gate pro zakazane simulacni patterny

## Kriterium uzavreni

Plan je splneny, az kdyz plati vsechno nasledujici:

- zadna cast produkcniho UI nepredstira identitu, data ani uspesne dokonceni operace
- produkcni build neobsahuje QA a test hooky
- mock a bootstrap mechanizmy jsou bud odstranene, nebo presunute mimo produkcni chod
- vsechny prazdne a chybove stavy jsou odvozene pouze z realnych API odpovedi
- na serveru je mozne automaticky i rucne overit, ze se aplikace chova pouze nad realnymi daty
