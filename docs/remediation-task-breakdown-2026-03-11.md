# Rozpad remediation plánu do implementačních tasků - stav k 2026-03-11

Navazuje na:

- `docs/forensic-audit-2026-03-11-deep.md`
- `docs/remediation-plan-2026-03-11-by-module.md`

Cil:

- prevest modulovy remediation plan na backlog realizovatelny po PR balicich,
- oddelit rozhodovaci tasky od implementacnich tasku,
- a dat kazdemu tasku jasny scope, soubory, zavislosti a verifikaci.

## Jak cist tento backlog

- `DISCOVERY` = kratky rozhodovaci nebo navrhovy task, bez ktereho hrozi slepa implementace.
- `BUILD` = skutecna implementace v kodu nebo schematu.
- `VERIFY` = testy, smoke behy nebo dokumentacni uzavreni.
- `PR balik` = doporucena skupina tasku, ktere maji drzet pohromade v jednom reviewable PR.

## Vlna 1 - Auth a runtime integrita

### TASK-A01 - Sjednotit frontend auth state kontrakt

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `web`, `admin`
- Soubory:
- `apps/kajovo-hotel-web/src/rbac.ts`
- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-admin/src/rbac.ts`
- `apps/kajovo-hotel-admin/src/main.tsx`
- Scope:
- zavest explicitni stavy `loading | authenticated | unauthenticated | error`,
- odstranit implicitni "kdyz auth selze, tak hrajeme recepci",
- sjednotit shape auth contextu mezi web a admin app.
- Hotovo kdyz:
- oba frontendy umi rozlisit chybu auth a neprihlaseny stav,
- auth context uz nevraci pseudoidentitu jako nouzove chovani.
- Verifikace:
- unit test na auth reducer nebo auth provider,
- manualni smoke: vypnute cookies, rozbity `/api/auth/me`, expired session.

### TASK-A02 - Odebrat `anonymous/recepce` fallback z webu

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `web`
- Soubory:
- `apps/kajovo-hotel-web/src/rbac.ts`
- `apps/kajovo-hotel-web/src/main.tsx`
- Scope:
- vyhodit fallback profil z RBAC helperu,
- navazat routing guard na novy auth state kontrakt,
- zajistit redirect na `/login` pri `unauthenticated`.
- Zavislosti:
- `TASK-A01`
- Hotovo kdyz:
- portal bez session neotevre provozni obrazovky,
- chyba `/api/auth/me` nezobrazi recepcni dashboard.
- Verifikace:
- Playwright smoke pro anonymous session,
- kontrola, ze protected route neskonci v aplikaci.

### TASK-A03 - Odebrat `anonymous/recepce` fallback z adminu

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `admin`
- Soubory:
- `apps/kajovo-hotel-admin/src/rbac.ts`
- `apps/kajovo-hotel-admin/src/main.tsx`
- Scope:
- odstranit fallback profil z admin auth flow,
- vynutit redirect na `/admin/login` bez validni session,
- oddelit auth chybu od bezneho neprihlaseneho stavu.
- Zavislosti:
- `TASK-A01`
- Hotovo kdyz:
- admin app bez session neotevre admin routy,
- `/api/auth/me` failure neskonci uvnitr aplikace.
- Verifikace:
- Playwright smoke pro admin bez cookies,
- kontrola route guards.

### TASK-A04 - Vyjmout query-driven demo state z web runtime

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `web`
- Soubory:
- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`
- Scope:
- odstranit `?state=` forcing a `useViewState()` z produkcni vetve,
- presunout state forcing do test-only helperu nebo fixtures,
- odstranit `StateSwitcher` a `StateMarker` z runtime.
- Hotovo kdyz:
- produkcni web build nema query-driven prepinani stavu,
- view-state simulace je k dispozici jen testum.
- Verifikace:
- grep na `state=` a `StateSwitcher` v produkcni vetvi,
- Playwright smoke nad real API flow bez query helperu.

### TASK-A05 - Vyjmout query-driven demo state z admin runtime

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `admin`
- Soubory:
- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-admin/src/routes/utilityStates.tsx`
- Scope:
- odstranit `?state=` flow a state utility z produkcni app,
- presunout utility states do test harnessu nebo story/test fixture vrstvy,
- odstranit runtime marker prvky.
- Hotovo kdyz:
- admin build neumi menit obrazovku pres query parametr,
- utility states neovlivnuji produkcni routovani.
- Verifikace:
- grep na `state=` a utility-state importy,
- smoke otevreni admin rout bez demo parametrizace.

### TASK-A06 - Odstranit `__KAJOVO_TEST_NAV__` injekci z produkcni navigace

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `web`, `admin`
- Soubory:
- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-admin/src/main.tsx`
- Scope:
- odstranit `window.__KAJOVO_TEST_NAV__` z produkcniho runtime,
- pokud testy potrebuji navigation hooks, nahradit je harness wrapperem mimo app kod.
- Hotovo kdyz:
- runtime navigace necte zadny globalni test hook z `window`,
- testy stale umi navigovat pres oficialni Playwright flow.
- Verifikace:
- grep na `__KAJOVO_TEST_NAV__`,
- cileny smoke beh bez runtime hooku.

### TASK-A07 - Nahradit fixed service date realnym zdrojem

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `web`, `admin`
- Soubory:
- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-admin/src/main.tsx`
- Scope:
- odstranit `2026-02-19`,
- pouzit aktualni lokalni datum nebo backend-configured service date,
- sjednotit helper pro default datum.
- Hotovo kdyz:
- nove snidane a dalsi flows nepredvyplnuji historicke demo datum.
- Verifikace:
- unit test na date helper,
- manualni smoke create flow.

### TASK-A08 - Navrhnout session persistence model

- Typ: `DISCOVERY`
- Priorita: `P0`
- Moduly: `api auth`, `security`, `db`
- Soubory:
- `apps/kajovo-hotel-api/app/security/auth.py`
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- Scope:
- rozhodnout session record schema,
- rozhodnout revocation semantics,
- rozhodnout vazbu na role snapshot, actor type a expiry.
- Hotovo kdyz:
- existuje kratky technicky navrh s DB poli, endpoint dopady a migracni strategii,
- team ma potvrzeny model pred zasahem do auth route.
- Verifikace:
- schvaleny ADR nebo ekvivalent v docs/issue.

### TASK-A09 - Pridat DB session tabulku a migraci

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `api auth`, `db`
- Soubory:
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/alembic/versions/*`
- Scope:
- pridat session record model,
- vytvorit alembic migraci,
- pripravit indexy na session id, actor id a expiry.
- Zavislosti:
- `TASK-A08`
- Hotovo kdyz:
- migrace projde na ciste DB,
- model umi persistovat session lifecycle metadata.
- Verifikace:
- migracni smoke,
- unit test pro create/load/revoke session record.

### TASK-A10 - Refaktorovat cookie auth na session identifier

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `api auth`, `security`
- Soubory:
- `apps/kajovo-hotel-api/app/security/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- Scope:
- zmenit cookie z plneho auth payloadu na identifikator session,
- nacitat identitu server-side ze session store,
- zachovat CSRF a expiry semantiku.
- Zavislosti:
- `TASK-A09`
- Hotovo kdyz:
- `/api/auth/me` a guards jsou napojene na session store,
- session jde odpojit bez zmeny cookie podpisu.
- Verifikace:
- auth unit testy,
- manualni login/logout smoke.

### TASK-A11 - Dopsat revoke/logout/session invalidation flows

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `api auth`, `users`
- Soubory:
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/users.py`
- `apps/kajovo-hotel-api/app/security/rbac.py`
- Scope:
- pridat revoke current session,
- pridat revoke all sessions pro actor,
- napojit invalidaci na disable user nebo role change.
- Zavislosti:
- `TASK-A10`
- Hotovo kdyz:
- zmena role nebo disable user zavre existujici session,
- logout invaliduje session record.
- Verifikace:
- test expired session,
- test revoke-all,
- test role-change invalidation.

### TASK-A12 - Uklidit auth tajemstvi a development fallback secret

- Typ: `BUILD`
- Priorita: `P0`
- Moduly: `api auth`, `config`
- Soubory:
- `apps/kajovo-hotel-api/app/config.py`
- `apps/kajovo-hotel-api/app/security/auth.py`
- Scope:
- odstranit produkcne nebezpecne fallbacky secretu,
- vynutit explicitni konfiguraci pro non-dev rezim,
- zretelne oddelit dev defaults od produkcni konfigurace.
- Hotovo kdyz:
- produkcni konfigurace bez secretu failne explicitne,
- dev mod ma jasne oznacene a omezene defaulty.
- Verifikace:
- config unit test,
- startup smoke pro dev a prod profil.

## Vlna 2 - Identita a konsolidace adminu

### TASK-B01 - Rozhodnout cilovy admin identity model

- Typ: `DISCOVERY`
- Priorita: `P1`
- Moduly: `api auth`, `users`, `admin`
- Soubory:
- `apps/kajovo-hotel-api/app/config.py`
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/app/api/schemas.py`
- Scope:
- rozhodnout, zda admin zustane role v `portal_users`, nebo samostatna tabulka,
- popsat bootstrap prvniho admina, password reset a audit log dopady.
- Hotovo kdyz:
- existuje jednoznacne rozhodnuti pro implementaci,
- navrh resi i migraci z ENV-only loginu.
- Verifikace:
- schvaleny ADR nebo backlog note.

### TASK-B02 - Persistovat admin identity do DB

- Typ: `BUILD`
- Priorita: `P1`
- Moduly: `api auth`, `users`, `db`
- Soubory:
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/users.py`
- `apps/kajovo-hotel-api/app/api/schemas.py`
- `apps/kajovo-hotel-api/alembic/versions/*`
- Scope:
- zavest persisted admin identity podle rozhodnuti z `TASK-B01`,
- dopsat create/update/disable flow,
- navazat login na DB identity misto ENV-only credentialu.
- Zavislosti:
- `TASK-B01`
- `TASK-A10`
- Hotovo kdyz:
- admin login porovnava proti persisted identite,
- admin ucet je auditovatelny a menitelný bez redeploye.
- Verifikace:
- API test create admin,
- API test disabled admin cannot login.

### TASK-B03 - Doresit bootstrap prvniho admina

- Typ: `BUILD`
- Priorita: `P1`
- Moduly: `api auth`, `scripts`, `docs`
- Soubory:
- `apps/kajovo-hotel-api/app/config.py`
- `apps/kajovo-hotel-api/alembic/versions/*`
- `scripts/*`
- `docs/how-to-run-api.md`
- Scope:
- zvolit bootstrap cestu: migrace, init command nebo jednorazovy setup script,
- zajistit, aby bootstrap nebyl skryte svazan s ENV-only auth.
- Zavislosti:
- `TASK-B02`
- Hotovo kdyz:
- novy operator umi vytvorit prvniho admina explicitnim a auditovatelnym krokem.
- Verifikace:
- fresh install smoke.

### TASK-B04 - Rozhodnout jeden admin frontend source of truth

- Typ: `DISCOVERY`
- Priorita: `P1`
- Moduly: `web`, `admin`, `docs`
- Soubory:
- `apps/kajovo-hotel-web/src/admin/*`
- `apps/kajovo-hotel-admin/src/*`
- `docs/how-to-run.md`
- `docs/README.md`
- Scope:
- rozhodnout, zda authoritative admin UI je standalone admin app nebo embedded admin ve webu,
- popsat migraci rout, deploye a ownership.
- Hotovo kdyz:
- existuje jednoznacny smer a seznam toho, co zustava a co se maze.
- Verifikace:
- schvalene rozhodnuti.

### TASK-B05 - Odstranit nebo deprecovat druhy admin surface

- Typ: `BUILD`
- Priorita: `P1`
- Moduly: `web`, `admin`
- Soubory:
- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-web/src/admin/AdminRoutes.tsx`
- `apps/kajovo-hotel-web/src/admin/AdminHomePage.tsx`
- `apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx`
- `apps/kajovo-hotel-admin/src/main.tsx`
- Scope:
- odstranit duplikovane routy a entrypointy podle rozhodnuti z `TASK-B04`,
- pokud mazani neni hned mozne, oznacit druhy surface jako deprecated a read-only.
- Zavislosti:
- `TASK-B04`
- Hotovo kdyz:
- v repu je jen jeden aktivni admin source of truth,
- build a routing tuto volbu realne respektuji.
- Verifikace:
- build smoke,
- docs/runbook smoke.

### TASK-B06 - Pridat admin profile route a password lifecycle

- Typ: `BUILD`
- Priorita: `P1`
- Moduly: `api auth`, `admin frontend`
- Soubory:
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/users.py`
- `apps/kajovo-hotel-api/app/api/schemas.py`
- `apps/kajovo-hotel-admin/src/main.tsx`
- Scope:
- pridat admin self-service profil,
- pridat zmenu hesla,
- pridat validaci stareho hesla a audit trail.
- Zavislosti:
- `TASK-B02`
- `TASK-B05`
- Hotovo kdyz:
- admin umi zmenit vlastni heslo bez zasahu do ENV,
- existuje samostatna admin profile/password route.
- Verifikace:
- API test password change,
- UI smoke pro profile page.

### TASK-B07 - Pridat portal self-service password change

- Typ: `BUILD`
- Priorita: `P1`
- Moduly: `api auth`, `portal frontend`
- Soubory:
- `apps/kajovo-hotel-api/app/api/schemas.py`
- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`
- Scope:
- dopsat endpoint pro zmenu hesla prihlasenym portal userem,
- pridat UI route a formular,
- pouzit uz existujici request schema nebo ho doplnit.
- Zavislosti:
- `TASK-A10`
- Hotovo kdyz:
- portal user umi zmenit vlastni heslo po prihlaseni.
- Verifikace:
- API test success/failure flow,
- Playwright smoke change password.

## Vlna 3 - Chybejici parity plochy

### TASK-C01 - Rekonstruovat legacy device lifecycle kontrakt

- Typ: `DISCOVERY`
- Priorita: `P1`
- Moduly: `api`, `security`, `docs`
- Soubory:
- `docs/feature-parity-matrix.csv`
- `docs/legacy-inventory.md`
- `apps/kajovo-hotel-api/app/api/routes/`
- Scope:
- sepsat minimalni cilovy kontrakt pro `register/challenge/verify/token`,
- identifikovat, ktere use-case jsou povinne a ktere lze nahradit.
- Hotovo kdyz:
- je jasne definovana MVP implementace device lifecycle.
- Verifikace:
- schvalena technicka specifikace.

### TASK-C02 - Zavest device entity a persistence

- Typ: `BUILD`
- Priorita: `P1`
- Moduly: `api`, `security`, `db`
- Soubory:
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/alembic/versions/*`
- Scope:
- vytvorit device model, status a token metadata,
- pripravit vazbu na user nebo actor identitu.
- Zavislosti:
- `TASK-C01`
- Hotovo kdyz:
- DB umi drzet device records a jejich stavovy lifecycle.
- Verifikace:
- migration smoke,
- DB unit tests.

### TASK-C03 - Implementovat `/device/*` endpointy

- Typ: `BUILD`
- Priorita: `P1`
- Moduly: `api`, `security`
- Soubory:
- `apps/kajovo-hotel-api/app/api/routes/`
- `apps/kajovo-hotel-api/app/security/`
- Scope:
- pridat register,
- challenge,
- verify,
- token flow podle schvaleneho kontraktu.
- Zavislosti:
- `TASK-C02`
- Hotovo kdyz:
- API vystavuje funkcni device lifecycle endpointy.
- Verifikace:
- contract/API testy na cely flow.

### TASK-C04 - Napojit RBAC a report flow na device actor

- Typ: `BUILD`
- Priorita: `P1`
- Moduly: `security`, `reports`
- Soubory:
- `apps/kajovo-hotel-api/app/security/rbac.py`
- `apps/kajovo-hotel-api/app/api/routes/reports.py`
- Scope:
- tam, kde legacy pocital s device actorem, doplnit autorizaci a audit trail,
- zajistit, aby device actor nemel sirsi prava nez ma mit.
- Zavislosti:
- `TASK-C03`
- Hotovo kdyz:
- device actor je podporovana identita v relevantnich tocich.
- Verifikace:
- RBAC testy,
- report API smoke.

### TASK-C05 - Zrekonstruovat report media auth kontrakt

- Typ: `DISCOVERY`
- Priorita: `P1`
- Moduly: `reports`, `media`, `docs`
- Soubory:
- `apps/kajovo-hotel-api/app/api/routes/reports.py`
- `apps/kajovo-hotel-api/app/media/storage.py`
- `docs/feature-parity-matrix.csv`
- Scope:
- zmapovat, co legacy cekal od report photo/thumb/original a media auth,
- rozhodnout, zda staci rozsireni stavajici media vrstvy, nebo je potreba novy auth endpoint.
- Hotovo kdyz:
- existuje finalni cilovy kontrakt pro report media tok.
- Verifikace:
- schvaleny navrh.

### TASK-C06 - Dopsat report media upload a autorizaci

- Typ: `BUILD`
- Priorita: `P1`
- Moduly: `reports`, `media`
- Soubory:
- `apps/kajovo-hotel-api/app/api/routes/reports.py`
- `apps/kajovo-hotel-api/app/media/storage.py`
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/alembic/versions/*`
- Scope:
- doplnit upload/list/thumb/original pro reporty,
- sjednotit auth model s `issues` a `lost_found`,
- pokud je treba, pridat media auth vrstvu.
- Zavislosti:
- `TASK-C05`
- Hotovo kdyz:
- report media tok ma parity-kompatibilni chovani.
- Verifikace:
- API test upload + read auth,
- smoke pro thumb/original access.

### TASK-C07 - Aktualizovat parity matici po device a media implementaci

- Typ: `VERIFY`
- Priorita: `P1`
- Moduly: `docs`
- Soubory:
- `docs/feature-parity-matrix.csv`
- Scope:
- po implementaci realne prepnout stavy z `MISSING` na aktualni hodnoty,
- doplnit poznamky ke zmenenemu chovani oproti legacy.
- Zavislosti:
- `TASK-C04`
- `TASK-C06`
- Hotovo kdyz:
- parity matice odpovida skutecnemu kodu.
- Verifikace:
- manualni review proti endpointum a UI.

## Vlna 4 - Operacni cleanup a test hardening

### TASK-D01 - Nahradit fake KPI na admin dashboardu realnou overview agregaci

- Typ: `BUILD`
- Priorita: `P2`
- Moduly: `admin`, `api`
- Soubory:
- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-api/app/api/routes/`
- Scope:
- bud pridat real overview endpoint,
- nebo fake KPI kartu odstranit, pokud agregace zatim nedava smysl.
- Hotovo kdyz:
- dashboard neukazuje natvrdo zapsana provozni cisla.
- Verifikace:
- UI smoke,
- API test overview pokud vznikne.

### TASK-D02 - Rozhodnout a opravit osud admin `/pokojska`

- Typ: `BUILD`
- Priorita: `P2`
- Moduly: `admin`
- Soubory:
- `apps/kajovo-hotel-admin/src/main.tsx`
- Scope:
- rozhodnout mezi plnou implementaci, redirectem nebo smazanim routy,
- odstranit slepy stub z navigace.
- Zavislosti:
- `TASK-B05`
- Hotovo kdyz:
- admin surface neobsahuje nefunkcni pokojskou routu.
- Verifikace:
- route smoke.

### TASK-D03 - Uklidit inventory `seed-defaults`

- Typ: `BUILD`
- Priorita: `P2`
- Moduly: `api inventory`
- Soubory:
- `apps/kajovo-hotel-api/app/api/routes/inventory.py`
- `apps/kajovo-hotel-api/tests/test_inventory.py`
- Scope:
- rozhodnout, zda route zustane jen pro dev/test,
- skryt ji za non-production guard nebo ji odstranit,
- odstranit sample supplier data z produkcni vetve.
- Hotovo kdyz:
- inventory bootstrap neni dostupny jako skryta demo funkce v produkci.
- Verifikace:
- inventory API testy,
- config smoke pro prod profil.

### TASK-D04 - Rozlisit mock/dev/prod mail mode

- Typ: `BUILD`
- Priorita: `P2`
- Moduly: `api settings`, `mail`
- Soubory:
- `apps/kajovo-hotel-api/app/config.py`
- `apps/kajovo-hotel-api/app/services/mail.py`
- `apps/kajovo-hotel-api/app/api/routes/settings.py`
- Scope:
- zavadet explicitni mail rezim,
- oddelit "SMTP settings saved" od "mail realne odesila".
- Hotovo kdyz:
- operator vidi rozdil mezi mock a real SMTP rezimem.
- Verifikace:
- unit test config rezimu,
- settings API smoke.

### TASK-D05 - Dodat SMTP operational status do API a UI

- Typ: `BUILD`
- Priorita: `P2`
- Moduly: `api settings`, `admin`
- Soubory:
- `apps/kajovo-hotel-api/app/api/routes/settings.py`
- `apps/kajovo-hotel-admin/src/main.tsx`
- Scope:
- pridat status endpoint nebo status pole,
- zobrazit `configured`, `enabled`, `last test result` v admin UI.
- Zavislosti:
- `TASK-D04`
- Hotovo kdyz:
- test mail flow nedava falesny pocit funkcnosti.
- Verifikace:
- UI smoke,
- API status test.

### TASK-D06 - Rozdelit frontend testy podle urovne dukazu

- Typ: `BUILD`
- Priorita: `P2`
- Moduly: `web tests`, `admin tests`
- Soubory:
- `apps/kajovo-hotel-web/tests/*.spec.ts`
- `apps/kajovo-hotel-admin/tests/*.spec.ts`
- Scope:
- rozdelit testy na mocked integration, view-state a real e2e smoke,
- prepsat naming a folder strukturu tak, aby bylo jasne, co je skutecny dukaz.
- Hotovo kdyz:
- z testu je okamzite citelne, ktere jsou mockovane a ktere real API.
- Verifikace:
- test listing a smoke beh vsech kategorii.

### TASK-D07 - Opravit Playwright harness a grep workflow

- Typ: `BUILD`
- Priorita: `P2`
- Moduly: `scripts`, `tests`
- Soubory:
- `scripts/run-playwright-with-api.js`
- `package.json`
- Scope:
- zjednodusit cileny beh testu,
- opravit port collision handling,
- odstranit stavy typu `No tests found` kvuli neergonomickemu wrapperu.
- Hotovo kdyz:
- cileny smoke test jde spustit jednim predvidatelnym prikazem.
- Verifikace:
- manualni beh konkretniho web a admin smoke testu.

### TASK-D08 - Pridat minimalni real-API smoke balicek

- Typ: `VERIFY`
- Priorita: `P2`
- Moduly: `web tests`, `admin tests`, `api`
- Soubory:
- `apps/kajovo-hotel-web/tests/*.spec.ts`
- `apps/kajovo-hotel-admin/tests/*.spec.ts`
- Scope:
- pridat aspon jeden real API smoke pro:
- portal login,
- admin login,
- users CRUD,
- breakfast create/update,
- inventory movement.
- Zavislosti:
- `TASK-A02`
- `TASK-A03`
- `TASK-D07`
- Hotovo kdyz:
- release gate nestoji jen na unit testech a mockovanem UI.
- Verifikace:
- CI nebo lokalni smoke run.

### TASK-D09 - Sjednotit docs na jeden current-state zdroj pravdy

- Typ: `BUILD`
- Priorita: `P2`
- Moduly: `docs`
- Soubory:
- `docs/new-system-inventory.md`
- `docs/parity-verdict.md`
- `docs/feature-parity-matrix.csv`
- `docs/forensic-audit.md`
- `docs/forensic-audit-2026-03-01.md`
- `docs/README.md`
- Scope:
- oznacit historicke dokumenty jako historicke,
- vytvorit nebo potvrdit jeden current-state dokument,
- opravit nepravdive auth/media/admin tvrzeni.
- Hotovo kdyz:
- docs si navzajem neodporuji v auth, media a admin modelu.
- Verifikace:
- manualni docs review.

## Doporucene PR baliky

### PR-1 Auth Guard Cleanup

- `TASK-A01`
- `TASK-A02`
- `TASK-A03`

### PR-2 Runtime Demo Extraction

- `TASK-A04`
- `TASK-A05`
- `TASK-A06`
- `TASK-A07`

### PR-3 Session Store Foundation

- `TASK-A08`
- `TASK-A09`
- `TASK-A10`
- `TASK-A11`
- `TASK-A12`

### PR-4 Admin Identity Migration

- `TASK-B01`
- `TASK-B02`
- `TASK-B03`

### PR-5 Admin Surface Consolidation

- `TASK-B04`
- `TASK-B05`

### PR-6 Password Workflows

- `TASK-B06`
- `TASK-B07`

### PR-7 Device Lifecycle Parity

- `TASK-C01`
- `TASK-C02`
- `TASK-C03`
- `TASK-C04`

### PR-8 Report Media Parity

- `TASK-C05`
- `TASK-C06`
- `TASK-C07`

### PR-9 Operational Cleanup

- `TASK-D01`
- `TASK-D02`
- `TASK-D03`
- `TASK-D04`
- `TASK-D05`

### PR-10 Test and Docs Hardening

- `TASK-D06`
- `TASK-D07`
- `TASK-D08`
- `TASK-D09`

## Kriticka cesta

1. `PR-1 Auth Guard Cleanup`
2. `PR-2 Runtime Demo Extraction`
3. `PR-3 Session Store Foundation`
4. `PR-4 Admin Identity Migration`
5. `PR-5 Admin Surface Consolidation`
6. `PR-6 Password Workflows`
7. `PR-7 Device Lifecycle Parity`
8. `PR-8 Report Media Parity`
9. `PR-9 Operational Cleanup`
10. `PR-10 Test and Docs Hardening`

## Minimalni definice uspesne remediation

- existuje jeden aktivni admin frontend source of truth,
- zadny frontend fallback nevyrobi lokalni `anonymous/recepce`,
- produkcni runtime neobsahuje `?state=` forcing ani `__KAJOVO_TEST_NAV__`,
- admin login nepouziva ENV-only identitu,
- session lze server-side revokovat,
- portal i admin umi self-service password workflow v rozsahu sve role,
- device a report media parity jsou bud implementovane, nebo vedome uzavrene jako nahradni kontrakt,
- existuje minimalni real API smoke sada,
- dokumentace odpovida skutecnemu kodu.
> Historical backlog document. It records the implementation task breakdown before execution.
> For current-state truth, current verification evidence and remaining open items, use `docs/forensic-audit-2026-03-11-current-state.md`.
