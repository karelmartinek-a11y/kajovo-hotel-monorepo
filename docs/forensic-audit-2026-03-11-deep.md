# Forenzni audit repozitare - hluboky stav k 2026-03-11

> Historical document. This file captures the pre-remediation forensic baseline.
> For the current forensic truth and remaining open findings, use `docs/forensics/runtime-truth-ssot-2026-03-15.md`.

## Exekutivni verdict

Repo neni cisty "frontend demo bez backendu". Naopak obsahuje realny FastAPI backend s persistentni SQLite vrstvou, migracemi, auth cookie session modelem a funkcnimi CRUD endpointy pro hlavni provozni moduly.

Zaroven ale repo neni forenzne ciste ani parity-kompletni. V aktualnim stavu jde o smes:

- skutecneho backendu pro jadro provozu,
- frontend runtime mechanismu urcenych pro QA/demo prezentaci,
- starych i novych auditnich dokumentu, ktere si vzajemne odporuji,
- a nekolika chybejicich parity ploch proti legacy systemu.

Proto je spravny verdikt:

**Castecne funkcni produkt s realnym backendem, ale stale kontaminovany demo/QA vrstvou a bez plne parity proti legacy zadani.**

## Co je prokazatelne realne implementovane

### API a persistence nejsou jen mock

- `apps/kajovo-hotel-api/app/main.py` registruje realne route moduly pro `auth`, `breakfast`, `lost_found`, `issues`, `inventory`, `reports`, `users`, `settings`.
- `apps/kajovo-hotel-api/app/db/session.py` pouziva skutecny SQLAlchemy engine a session factory.
- `apps/kajovo-hotel-api/alembic/versions/*` obsahuje realne migrace pro reports, breakfast, lost-found, issues, inventory, audit trail, portal users, SMTP a media.
- `apps/kajovo-hotel-api/tests/*` prochazeji. Behem auditu probehlo `pnpm unit` a vysledek byl `45 passed`.

### Auth model uz neni jen header-based

- `apps/kajovo-hotel-api/app/api/routes/auth.py` implementuje:
  - admin login/logout,
  - portal login/logout,
  - forgot-password,
  - role selection,
  - session identity `/api/auth/me`,
  - unlock flow.
- `apps/kajovo-hotel-api/app/security/auth.py` ma podepisovane session cookie a CSRF ochranu.

### Hlavni moduly maji realne CRUD toky

- breakfast: `apps/kajovo-hotel-api/app/api/routes/breakfast.py`
- lost & found: `apps/kajovo-hotel-api/app/api/routes/lost_found.py`
- issues: `apps/kajovo-hotel-api/app/api/routes/issues.py`
- inventory: `apps/kajovo-hotel-api/app/api/routes/inventory.py`
- reports: `apps/kajovo-hotel-api/app/api/routes/reports.py`
- users admin: `apps/kajovo-hotel-api/app/api/routes/users.py`
- SMTP settings: `apps/kajovo-hotel-api/app/api/routes/settings.py`

### Media pipeline uz existuje alespon castecne

- `issues` a `lost_found` maji upload/list/thumb/original endpointy:
  - `apps/kajovo-hotel-api/app/api/routes/issues.py`
  - `apps/kajovo-hotel-api/app/api/routes/lost_found.py`
- `inventory` ma pictogram upload + thumb:
  - `apps/kajovo-hotel-api/app/api/routes/inventory.py`
- samotne ukladani a thumbnail fallback resi:
  - `apps/kajovo-hotel-api/app/media/storage.py`

## Kriticke nalezy

### 1. Frontendy maji zabudovane demo/QA runtime mechanismy

Tohle je nejvetsi forenzni problem na strane UI. Aplikace umi bezet nad backendem, ale zaroven obsahuje vestavene mechanismy, ktere umoznuji simulovat stavy a maskovat nefunkcni integraci.

Dukazy:

- pevne datum `2026-02-19`:
  - `apps/kajovo-hotel-web/src/main.tsx:198`
  - `apps/kajovo-hotel-admin/src/main.tsx:250`
- vynuceni stavovych variant pres query `?state=`:
  - `apps/kajovo-hotel-web/src/main.tsx:327-389`
  - `apps/kajovo-hotel-admin/src/main.tsx:379-441`
- toolbar pro prepinani view stavu mimo produkci:
  - `apps/kajovo-hotel-web/src/main.tsx:391-408`
  - `apps/kajovo-hotel-admin/src/main.tsx:443-460`
- injektovatelna navigace pres `window.__KAJOVO_TEST_NAV__`:
  - `apps/kajovo-hotel-web/src/main.tsx:2523-2527`
  - `apps/kajovo-hotel-admin/src/main.tsx:3423-3433`

Dopad:

- UI muze pusobit jako hotove i tam, kde backend neni primarni zdroj chovani.
- Stavove scenare jsou primo soucasti runtime, ne jen test harness.
- Forenzne se hur oddeluje realna funkcnost od pripravene prezentacni vrstvy.

### 2. Oba frontendy fallbackuji na lokalni pseudo-identitu

Dukazy:

- portal fallback na `anonymous/recepce`:
  - `apps/kajovo-hotel-web/src/rbac.ts:35-45`
  - `apps/kajovo-hotel-web/src/main.tsx:2505-2517`
- admin fallback na stejnou pseudo-identitu:
  - `apps/kajovo-hotel-admin/src/rbac.ts:35-45`
  - `apps/kajovo-hotel-admin/src/main.tsx:3387-3399`

Dopad:

- pri selhani `/api/auth/me` klient nespadne do "nejste prihlasen", ale sam si vyrobi portalovou identitu.
- to je zavazny auditni zapach: UI zustava "obyvatelne" i bez validni session.
- backend sice write endpointy stale chrani, ale frontend forenzne zkresluje skutecny auth stav.

### 3. Admin auth je porad fixed-credential ENV login, ne plnohodnotny admin account model

Dukazy:

- admin login porovnava zadane udaje pouze proti `settings.admin_email` a `settings.admin_password`:
  - `apps/kajovo-hotel-api/app/api/routes/auth.py:206-226`
- defaulty v konfiguraci:
  - `apps/kajovo-hotel-api/app/config.py:12-16`
- UI samo explicitne rika, ze admin pristup je "mimo role portalu":
  - `apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx:632`
  - `apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx:642`

Dopad:

- portal users jsou realne v DB, ale admin identita je zvlastni globalni ENV ucet.
- to je proti ocekavani normalniho admin identity lifecycle.
- profile/password workflow pro admina stale chybi i podle parity matice.

### 3.1 Session model nema server-side revokaci ani session inventory

Dukazy:

- session cookie je pouze podepsany HMAC payload:
  - `apps/kajovo-hotel-api/app/security/auth.py:20-57`
- defaultni secret ma development fallback:
  - `apps/kajovo-hotel-api/app/security/auth.py:20-22`
- v API neni session store ani tabulka pro revokaci/invalidaci session

Dopad:

- pri zmene roli, kompromitaci cookie nebo potrebe force logout neni centralni session evidence.
- jde o funkcni, ale architektonicky zjednoduseny session model.
- proti plnohodnotnemu admin/session modelu je to stale parity deficit.

### 4. Repo obsahuje dva rozdilne admin povrchy

Dukazy:

- portal web mountuje vlastni `/admin/*` routy:
  - `apps/kajovo-hotel-web/src/main.tsx:2532-2533`
- tato embedded admin vrstva je zjednodusena:
  - `apps/kajovo-hotel-web/src/admin/AdminRoutes.tsx:84-105`
  - obsahuje jen home + users
- soucasne existuje samostatna admin app:
  - `apps/kajovo-hotel-admin/src/main.tsx`
  - ta obsahuje mnohem sirsi funkcnost vcetne settings, breakfast importu, foto toku, inventory seed a stocktake PDF

Dopad:

- repo nema jeden jasny admin frontend zdroj pravdy.
- cast admin chovani je duplikovana a cast je pouze v jedne vetvi.
- to je vysoce rizikove pro drift, regresi a nejasny deployment model.

### 5. Parity proti legacy stale chybi na systemove urovni

#### 5.1 Device lifecycle chybi

Dukazy:

- `docs/feature-parity-matrix.csv` oznacuje `Device register/challenge/verify/token` jako `MISSING`
- lokalni hledani v repo nepotvrdilo zadne `/device/*` endpointy v novem API

Dopad:

- pokud legacy zadani pocitalo s device provisioningem a challenge/verify modelem, nove reseni parity nema.

#### 5.2 Report media/media-auth parity chybi

Dukazy:

- `docs/feature-parity-matrix.csv` stale vede `Reports, Photo thumbs/media authorization` jako `MISSING`
- aktualni API ma fotky pro `issues` a `lost_found`, ale ne ekvivalent legacy report/media auth ploch
- starsi parity docs zminuji chybejici `/api/internal/media-auth` a report photo thumb path:
  - `docs/parity-verdict.md`
  - `docs/forensic-audit.md`

Dopad:

- cast media parity byla doplnena, ale ne cela.
- stare verdikty "chybi media pipeline" uz nejsou presne; presnejsi je "chybi report/media-auth parity".

#### 5.3 Admin profile/password workflow stale chybi

Dukazy:

- `docs/feature-parity-matrix.csv`:
  - `Profile, Admin profile/password change, MISSING`

Dopad:

- admin management neni parity-kompletni ani po doplneni users/settings.

#### 5.4 Portal self-service zmena hesla chybi

Dukazy:

- schema existuje:
  - `apps/kajovo-hotel-api/app/api/schemas.py:487-489`
- zadna route ji nepouziva:
  - `apps/kajovo-hotel-api/app/api/routes/auth.py`

Dopad:

- uzivatel portalu si neumi sam zmenit heslo bez admin zasahu nebo reset linku.
- i pres existenci forgot/reset flow chybi bezny account maintenance workflow.

## Vysoce dulezite, ale ne fatalni nalezy

### 6. Testy frontendu ve velkem overuji mockovane scenare

Dukazy:

- `apps/kajovo-hotel-web/tests/visual.spec.ts` mockuje prakticky vsechny REST endpointy pres `page.route(...)`
- `apps/kajovo-hotel-web/tests/smoke.spec.ts` stubuje auth i users flow
- `apps/kajovo-hotel-admin/tests/users-admin.spec.ts` mockuje `/api/auth/me` i `/api/v1/users`

Dopad:

- frontend test suite dokazuje render a UX logiku, ale ne plnou integraci s realnym backendem.
- repo tedy ma realny backend, ale frontend confidence je casto zalozena na fixture datech a interception testech.

### 7. Pokusy o cileny Playwright beh odhalily neprehledny test harness

Behem auditu:

- `pnpm unit` uspesne proslo.
- cileny beh Playwright grep scenaru nad web/admin skoncil `No tests found`.
- u admin behu navic doslo ke kolizi portu `127.0.0.1:8000`.

Dopad:

- test stack existuje, ale neni forenzne "out of box" hladky pro cilenou verifikaci.
- to navazuje na starsi parity varovani o e2e/smoke provozuschopnosti.

### 8. Inventory obsahuje bootstrap/demo endpoint

Dukazy:

- hardcoded `DEFAULT_INVENTORY_ITEMS`:
  - `apps/kajovo-hotel-api/app/api/routes/inventory.py:34-67`
- seed endpoint:
  - `apps/kajovo-hotel-api/app/api/routes/inventory.py:108-123`
- admin UI na nej aktivne saha:
  - `apps/kajovo-hotel-admin/src/main.tsx:2065`

Dopad:

- inventory neni jen demo, ale ma v sobe explicitni bootstrap workflow pro vyplneni ukazkovych zakladnich polozek.
- pokud by to bezelo v produkci bez guardrailu, muze to michat provozni a inicializacni data.

### 9. Frontend dashboard a cast formulare drzi hardcoded domenu

Dukazy:

- seznam pokoju napevno:
  - `apps/kajovo-hotel-web/src/main.tsx:110-140`
- admin dashboard drzi napevno KPI hodnoty misto fetch:
  - `apps/kajovo-hotel-admin/src/main.tsx`
- starsi web/admin verze drzi napevno ruzne display hodnoty a fixed service date

Dopad:

- nejde o cisty backend-driven UI.
- hlavne prehledy a nektere pomocne workflow zustavaji designove tvrdodratove.

### 10. SMTP flow je defaultne mock/no-op, dokud operator nezmeni ENV

Dukazy:

- konfigurace defaultne startuje s `smtp_enabled = False`:
  - `apps/kajovo-hotel-api/app/config.py:14`
- mail service pri vypnutem SMTP pouziva mock/no-op implementaci:
  - `apps/kajovo-hotel-api/app/services/mail.py`
- auth unlock, onboarding, reset-link a SMTP test email na tuto vrstvu spoléhají:
  - `apps/kajovo-hotel-api/app/api/routes/auth.py`
  - `apps/kajovo-hotel-api/app/api/routes/users.py`
  - `apps/kajovo-hotel-api/app/api/routes/settings.py`

Dopad:

- samotne ulozeni SMTP nastaveni do DB jeste neznamena, ze emaily realne odchazeji.
- bez operatorniho prepnuti ENV muze system pusobit funkcne, ale produkcni email side effects nenastanou.

### 11. Cast admin surface je stale stub nebo prezentacni vrstva

Dukazy:

- `/pokojska` v admin app je jen staticky stub bez CRUD napojeni:
  - `apps/kajovo-hotel-admin/src/main.tsx`
- admin dashboard overview pouziva napevno zapsane KPI karty bez realneho fetch mechanismu:
  - `apps/kajovo-hotel-admin/src/main.tsx`

Dopad:

- admin povrch neni konzistentne backend-driven.
- cast rout vypada hotove, ale slouzi jen jako prezentacni nebo navigacni mezivrstva.

## Dokumentacni forenzni nalezy

### 12. Repo obsahuje vic vzajemne rozpornych "pravd" o stavu systemu

Nejviditelnejsi rozpor:

- `docs/new-system-inventory.md` stale tvrdi:
  - RBAC pres request headers
  - zadny cookie/session admin auth
- skutecny kod dnes obsahuje cookie session auth:
  - `apps/kajovo-hotel-api/app/api/routes/auth.py`
  - `apps/kajovo-hotel-api/app/security/auth.py`

Dalsi rozpor:

- starsi forenzni docs tvrdi, ze fotky/thumbnails pro issues/lost-found chybi
- aktualni API je uz ma

Dopad:

- auditni dokumentace v repo neni konzistentni casova osa.
- bez cteni skutecneho kodu vede k mylnym zaverum.

## Shrnuti po vrstvach

### Backend

Verdikt: **realny a funkcni pro jadro provozu**, nikoliv jen demo.

Silne stranky:

- persistence
- migrace
- session auth
- CRUD moduly
- users/settings
- cast media

Mezery:

- device parity
- admin profile parity
- report/media-auth parity
- fixed admin credential model

### Portal web

Verdikt: **funkcni UI nad realnym backendem, ale se silnou QA/demo kontaminaci runtime**.

Silne stranky:

- realne CRUD obrazovky
- typed client
- auth/login flow
- media upload flow pro nektere moduly

Mezery:

- anonymous fallback identita
- forced state query mechanismy
- fixed dates
- hardcoded prehledove hodnoty
- embedded mini-admin drift

### Admin web

Verdikt: **nejplnejsi frontend surface v repo**, ale stale ne auditne cisty.

Silne stranky:

- users management
- SMTP settings
- breakfast import
- inventory documents/bootstrap
- issue/lost-found photo flows

Mezery:

- stejna demo/QA runtime vrstva jako portal
- anonymous fallback identita
- role view simulator v `sessionStorage`
- reliance na fixed admin credential model

## Konecny zaver proti zadani a ocekavani

Pokud ocekavani zni:

1. "Je to plne hotovy, backendove skutecny system bez demo vrstev?"

Tak odpoved je:

**Ne.** Backend je realny, ale frontendy stale obsahuji vestavene demo/QA mechanismy a repo neni parity-ciste.

2. "Jsou hlavni hotelove moduly jen obrazky a makety?"

Tak odpoved je:

**Ne uplne.** CRUD jadro pro breakfast, lost-found, issues, inventory a reports je skutecne implementovane.

3. "Je to parity-gotove proti legacy?"

Tak odpoved je:

**Ne.** Chybi minimalne device lifecycle parity, admin profile/password parity a cast report/media auth parity. Navic admin identity model je architektonicky zjednoduseny proti plnohodnotnemu account modelu.

## Doporučene forenzni priority

1. Odstranit z produkcniho runtime vsechny demo/QA hooky:
   - `?state=`
   - anonymous fallback identity
   - `__KAJOVO_TEST_NAV__`
   - fixed service date

2. Rozhodnout jeden admin frontend source of truth:
   - bud ponechat samostatny `apps/kajovo-hotel-admin`
   - nebo odstranit embedded `/admin/*` vrstvu z portal webu

3. Uzavrit parity mezery:
   - `/device/*`
   - admin profile/password
   - report photo/media-auth

4. Prepsat dokumentaci tak, aby existoval jeden aktualni stavovy audit a starsi dokumenty byly explicitne oznaceny jako historicke.

5. Zprisnit integračni testy:
   - mene `page.route()` fixture testu pro klicove smoke cesty
   - vice realnych end-to-end behu nad skutecnym API

## Overeni provedene v tomto auditu

- procitani zdrojoveho kodu `apps/kajovo-hotel-web`, `apps/kajovo-hotel-admin`, `apps/kajovo-hotel-api`, `packages/shared`, `docs`
- lokalni porovnani deklaraci v parity dokumentech proti skutecnemu kodu
- spusteni `pnpm unit`:
  - vysledek: `45 passed`
- pokus o cilene Playwright behy:
  - narazeno na `No tests found` v package harnessu
  - u admin behu navic kolize portu `127.0.0.1:8000`
