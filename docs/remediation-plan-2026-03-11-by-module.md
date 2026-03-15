# Remediation plan po modulech a souborech - stav k 2026-03-11

> Historical planning document. The P0/P1 items described here were the implementation backlog at audit time.
> For the current delivered state and remaining open findings, use `docs/forensics/runtime-truth-ssot-2026-03-15.md`.

Navazuje na:

- `docs/forensic-audit-2026-03-11-deep.md`
- `docs/remediation-task-breakdown-2026-03-11.md`

Cil:

- odstranit demo/QA kontaminaci z runtime,
- uzavrit nejtezsi parity mezery,
- sjednotit zdroje pravdy mezi web/admin/API/docs,
- a rozdelit praci do realizovatelnych bloků po modulech a souborech.

## Prioritizace

### P0

Blokery, ktere zkresluji realny provozni stav nebo ohrozuji auth/session jistotu.

### P1

Vysoke parity mezery a architektonicky drift, ktery brzdi dalsi rozvoj.

### P2

Stredne zavazne cistici prace, dokumentacni synchronizace a test hardening.

## P0

### P0.1 Auth fallback a pristup anonymniho klienta

Problem:

- oba frontendy fallbackuji pri chybe `/api/auth/me` na lokalni pseudo-identitu `anonymous/recepce`
- UI pak vypada, ze je uzivatel uvnitr systemu, i kdyz nema validni session

Moduly:

- `web`
- `admin`
- `shared auth/rbac`

Soubory:

- `apps/kajovo-hotel-web/src/rbac.ts`
- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-admin/src/rbac.ts`
- `apps/kajovo-hotel-admin/src/main.tsx`

Akce:

1. Zrusit fallback profil `anonymous/recepce`.
2. Rozdelit auth stav na:
   - `loading`
   - `authenticated`
   - `unauthenticated`
   - `error`
3. V `AppRoutes` pri `unauthenticated` vynutit redirect na `/login` nebo `/admin/login`.
4. Pri chybe `/api/auth/me` zobrazit explicitni auth/system chybu, ne provozni modul.

Definition of done:

- bez session nelze vstoupit do provoznich rout,
- pri selhani `/api/auth/me` neni uzivatel tise povysen na `recepce`,
- Playwright smoke test overi redirect na login bez session.

Zavislosti:

- zadne

### P0.2 Odstraneni runtime demo/QA hooku z produkcni logiky

Problem:

- web i admin drzi `?state=` forcing, `__KAJOVO_TEST_NAV__` a fixed service date
- runtime je kontaminovany testovacimi mechanismy

Moduly:

- `web`
- `admin`

Soubory:

- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`
- `apps/kajovo-hotel-admin/src/main.tsx`

Akce:

1. Vyjmout `StateSwitcher`, `StateMarker`, query-driven `useViewState()` z produkcniho runtime.
2. Presunout view-state simulaci do test-only harnessu.
3. Odstranit `window.__KAJOVO_TEST_NAV__` z produkcni navigace.
4. Nahradit fixed `defaultServiceDate = '2026-02-19'` aktualnim datem nebo konfiguraci z backendu.

Definition of done:

- produkcni build neobsahuje runtime prepinani view stavu pres query,
- navigace nepodporuje test injection z `window`,
- nove zaznamy snidani nepredvyplnuji historicke demo datum.

Zavislosti:

- vhodne delat soubezne s P2.4 test harness cleanup

### P0.3 Session model s revokaci a rotaci

Problem:

- session je jen HMAC cookie bez server-side revokace a bez session inventory
- neni centralni moznost force logout, revoke po zmene role, ztracenem zarizeni nebo incidentu

Moduly:

- `api auth`
- `security`

Soubory:

- `apps/kajovo-hotel-api/app/security/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/alembic/versions/*`
- `apps/kajovo-hotel-api/tests/test_auth_constraints.py`
- `apps/kajovo-hotel-api/tests/test_auth_role_selection.py`

Akce:

1. Zavest DB tabulku pro session records.
2. Cookie nechat jako session identifier, ne jako plny samonosny auth payload.
3. Pri loginu vytvaret session record s expiraci, actor type, role snapshotem a revocation flagem.
4. `/api/auth/me` a RBAC guardy napojit na session store.
5. Pridat logout/revoke all/revoke current session flow.
6. Zrusit development fallback secret v produkcne relevantni vetvi.

Definition of done:

- session lze revokovat server-side,
- zmena role nebo disable user zneplatni aktivni session,
- testy pokryji logout, revoke a expired session.

Zavislosti:

- muze navazat na P1.1 admin identity model

## P1

### P1.1 Sjednoceni admin identity modelu

Problem:

- admin login je fixed ENV credential
- portal users jsou v DB, admin identita je mimo tento model

Moduly:

- `api auth`
- `users`
- `admin frontend`

Soubory:

- `apps/kajovo-hotel-api/app/config.py`
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/users.py`
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/app/api/schemas.py`
- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx`

Akce:

1. Rozhodnout, zda admin bude:
   - specialni role uvnitr `portal_users`, nebo
   - samostatna admin entita v DB.
2. Nahradit `settings.admin_email` + `settings.admin_password` persisted admin account modelem.
3. Doresit bootstrap prvniho admina migraci nebo init skriptem.
4. Doresit spravu admin password lifecycle.

Definition of done:

- admin login neporovnava credentials jen proti ENV,
- admin identity jsou auditovatelne a menitelne bez redeploye,
- users/admin management odpovida jednomu konzistentnimu modelu.

Zavislosti:

- vhodne resit pred P1.2 a P1.3

### P1.2 Jeden admin frontend source of truth

Problem:

- repo obsahuje dva rozdilne admin povrchy
- embedded admin ve webu a samostatnou admin app

Moduly:

- `web`
- `admin`

Soubory:

- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-web/src/admin/AdminRoutes.tsx`
- `apps/kajovo-hotel-web/src/admin/AdminHomePage.tsx`
- `apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx`
- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-admin/src/routes/utilityStates.tsx`
- `docs/how-to-run.md`
- `docs/README.md`

Akce:

1. Rozhodnout, jestli authoritative admin UI je:
   - `apps/kajovo-hotel-admin`, nebo
   - admin routy uvnitr `apps/kajovo-hotel-web`.
2. Druhou variantu odstranit nebo explicitne oznacit jako deprecated.
3. Opravit deploy/runbook/docs podle finalni volby.

Definition of done:

- v repu existuje jeden aktivni admin frontend source of truth,
- build, deploy a docs ho konzistentne reflektuji,
- zmizi duplikovane admin routy a drift.

Zavislosti:

- zadne, ale vhodne pred P2 docs sync

### P1.3 Device lifecycle parity

Problem:

- chybi `/device/*` register/challenge/verify/token flow

Moduly:

- `api`
- `security`
- `docs`

Soubory:

- `apps/kajovo-hotel-api/app/api/routes/`
- `apps/kajovo-hotel-api/app/security/`
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/alembic/versions/*`
- `docs/feature-parity-matrix.csv`
- `docs/legacy-inventory.md`

Akce:

1. Navrhnout cilovy kontrakt device lifecycle podle legacy mapy.
2. Zavest device entity, challenge/verify flow a token storage.
3. Napojit report/category RBAC na device actor mode tam, kde to legacy vyzadovalo.
4. Dopsat kontraktove a API testy.

Definition of done:

- existuji implementovane `/device/*` endpointy,
- jsou persistovane device records,
- parity matrix se zmeni z `MISSING` na realny stav.

Zavislosti:

- muze zaviset na P0.3 session/security modelu

### P1.4 Admin profile/password a portal self-service password change

Problem:

- admin profile/password workflow chybi
- portal self-service change password chybi, i kdyz schema pro request uz existuje

Moduly:

- `api auth/users`
- `admin frontend`
- `portal frontend`

Soubory:

- `apps/kajovo-hotel-api/app/api/schemas.py`
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/users.py`
- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`

Akce:

1. Pridat endpoint pro portal self-service zmenu hesla.
2. Pridat admin profile/password UX.
3. Pokud vznikne persisted admin identity model, pridat self-service zmenu hesla i pro admina.
4. Dopsat validaci starych/novych hesel, audit log a testy.

Definition of done:

- portal user umi zmenit heslo po prihlaseni,
- admin ma profile/password route,
- parity matrix uz tuto oblast nevede jako `MISSING`.

Zavislosti:

- P1.1

### P1.5 Report media/media-auth parity

Problem:

- media pipeline pro `issues` a `lost_found` uz existuje
- ale report/media-auth parity proti legacy stale chybi

Moduly:

- `api reports/media`
- `admin/web`
- `docs`

Soubory:

- `apps/kajovo-hotel-api/app/api/routes/reports.py`
- `apps/kajovo-hotel-api/app/media/storage.py`
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/alembic/versions/*`
- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-admin/src/main.tsx`
- `docs/feature-parity-matrix.csv`

Akce:

1. Dorekonstruovat legacy report photo/thumb/media auth use-cases.
2. Rozhodnout, zda je potreba `/api/internal/media-auth` nebo jina autorizacni vrstva.
3. Dopsat report photo upload/thumb/original flow.
4. Sjednotit media authorization mezi reports/issues/lost-found/inventory.

Definition of done:

- report media ma stejny nebo nahradni parity-kompatibilni tok,
- docs uz netvrdi `MISSING` bez vyhrady,
- media auth model je jednotny.

Zavislosti:

- zadne

## P2

### P2.1 Admin dashboard a stub moduly

Problem:

- admin dashboard ukazuje fake KPI
- `/pokojska` v adminu je jen stub

Moduly:

- `admin`

Soubory:

- `apps/kajovo-hotel-admin/src/main.tsx`

Akce:

1. Nahradit fake KPI fetchovanou overview agregaci z API nebo kartu odstranit.
2. Rozhodnout osud admin `/pokojska`:
   - plna implementace,
   - redirect,
   - nebo odstraneni z admin surface.

Definition of done:

- dashboard nema natvrdo zapsane provozni cisla,
- housekeeping route uz neni slepy stub.

Zavislosti:

- muze cekat na rozhodnuti v P1.2

### P2.2 Inventory bootstrap route

Problem:

- inventory ma `/seed-defaults` endpoint a default sample polozky

Moduly:

- `api inventory`
- `admin`

Soubory:

- `apps/kajovo-hotel-api/app/api/routes/inventory.py`
- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-api/tests/test_inventory.py`

Akce:

1. Rozhodnout, zda je `seed-defaults`:
   - jen dev/test helper,
   - migration/bootstrap krok,
   - nebo ma byt odstranen.
2. Pokud zustane, skryt ho za admin bootstrap guard nebo non-production flag.
3. Odstranit `Default supplier` canned data z produkcni vetve.

Definition of done:

- seed route neni dostupna bez explicitniho provozniho rozhodnuti,
- inventory data nejsou michana s demo fixture.

Zavislosti:

- zadne

### P2.3 SMTP operational hardening

Problem:

- SMTP flow je defaultne mock/no-op, dokud se neprepne ENV

Moduly:

- `api settings/auth/users`
- `docs`

Soubory:

- `apps/kajovo-hotel-api/app/config.py`
- `apps/kajovo-hotel-api/app/services/mail.py`
- `apps/kajovo-hotel-api/app/api/routes/settings.py`
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/users.py`
- `docs/how-to-run-api.md`
- `docs/test-accounts.md`

Akce:

1. Explicitne rozdelit mock/dev/prod mail mode.
2. Ulozeni SMTP settings doplnit o jasny operational status endpoint.
3. Do admin UI pridat indikaci:
   - SMTP configured
   - SMTP enabled
   - last test result
4. Dopsat docs, ze DB settings samy o sobe nestaci bez ENV enable.

Definition of done:

- operator vidi, zda mail opravdu odchazi,
- SMTP test email nedava falesny pocit funkcnosti.

Zavislosti:

- zadne

### P2.4 Test harness cleanup

Problem:

- frontend testy ve velkem mockuji API
- cileny Playwright beh je neprehledny a grep workflow neni ergonomicky

Moduly:

- `web tests`
- `admin tests`
- `scripts`

Soubory:

- `apps/kajovo-hotel-web/tests/*.spec.ts`
- `apps/kajovo-hotel-admin/tests/*.spec.ts`
- `scripts/run-playwright-with-api.js`
- `package.json`

Akce:

1. Rozdelit testy na:
   - component/view-state tests,
   - mocked integration tests,
   - real e2e smoke tests.
2. Zjednodusit package scripts pro cileny grep beh.
3. Opravit port collision handling v lokálním harnessu.
4. Pro P0/P1 cesty pridat aspon minimalni real API e2e bez `page.route()`.

Definition of done:

- je jasne, ktery test co dokazuje,
- cileny Playwright beh funguje bez rucniho obchazeni harnessu.

Zavislosti:

- vhodne po P0.1 a P0.2

### P2.5 Dokumentacni synchronizace

Problem:

- docs popisuji vice vzajemne rozpornych stavu systemu

Moduly:

- `docs`

Soubory:

- `docs/new-system-inventory.md`
- `docs/parity-verdict.md`
- `docs/feature-parity-matrix.csv`
- `docs/forensic-audit.md`
- `docs/forensic-audit-2026-03-01.md`
- `docs/README.md`

Akce:

1. Oznacit historicke dokumenty jako historicke.
2. Vytvorit jeden aktualni "current-state" dokument a odkazovat na nej z `docs/README.md`.
3. Opravit stale nepravdive tvrzeni:
   - header-only auth
   - chybejici media pipeline pro issues/lost-found
4. Synchronizovat parity matici s realnym stavem po P1 implementacich.

Definition of done:

- docs netvrdi navzajem protichudne veci o auth/media/admin stavu,
- existuje jeden aktualni SSOT pro technicky stav.

Zavislosti:

- idealne po P0/P1 realizaci, ale muze zacit ihned jako cleanup

## Doporučene poradi realizace

1. P0.1 Auth fallback
2. P0.2 Runtime demo/QA cleanup
3. P0.3 Session model
4. P1.1 Admin identity model
5. P1.2 Jeden admin frontend source of truth
6. P1.4 Profile/password workflows
7. P1.3 Device lifecycle parity
8. P1.5 Report media/media-auth parity
9. P2.1 Dashboard + stub modules
10. P2.2 Inventory seed cleanup
11. P2.3 SMTP hardening
12. P2.4 Test harness cleanup
13. P2.5 Docs sync

## Navrh rozdeleni do implementacnich baliku

### Balik A - Auth and Runtime Integrity

- P0.1
- P0.2
- P0.3

### Balik B - Identity and Admin Consolidation

- P1.1
- P1.2
- P1.4

### Balik C - Legacy Parity Gaps

- P1.3
- P1.5

### Balik D - Operational Cleanup

- P2.1
- P2.2
- P2.3
- P2.4
- P2.5

## Minimalni release gate po remediation

Pred oznacenim remediation za hotovou musi platit:

- bez session nelze otevrit provozni moduly ve web/admin UI
- produkcni runtime neumi `?state=` forcing ani `__KAJOVO_TEST_NAV__`
- admin login nepouziva fixed ENV credential jako jediny identity model
- session lze server-side revokovat
- existuje jeden admin frontend source of truth
- parity matrix je aktualizovana podle skutecneho kodu
- existuje aspon jeden real API smoke test pro:
  - portal login
  - admin login
  - users CRUD
  - breakfast create/update
  - inventory movement
