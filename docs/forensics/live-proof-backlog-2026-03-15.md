# Live proof backlog (2026-03-15)

Datum: 2026-03-15
Repo root: `C:\GitHub\kajovo-hotel-monorepo`
Typ dokumentu: autoritativni backlog runtime dukazu navazany na parity matrix
Status: aktivni

## Ucel

Tento dokument preklada hodnoty `Runtime prokazano` z [docs/feature-parity-matrix.csv](/C:/GitHub/kajovo-hotel-monorepo/docs/feature-parity-matrix.csv)
do jednoznacneho backlogu:

- co uz ma live proof,
- co ma jen test proof,
- co ma jen archivni nebo smoke proof,
- co nema produkcni runtime dukaz vubec,
- jaky dalsi dukaz je potreba.

Tento dokument nenahrazuje runtime truth SSOT. Je to operacni backlog pro uzavirani `PARTIAL` a `NO` polozek.

## Duvodne kategorie

1. `LIVE_PROVEN`
   Existuje live produkcni dukaz nebo deploy gate svazany s realnym SHA.
2. `TEST_PROVEN_ONLY`
   Funkce je dolozena testy, ale ne live runtime dukazem.
3. `ARCHIVAL_SMOKE_ONLY`
   Existuje smoke nebo archivni dukaz, ale ne live produkcni integrace.
4. `NO_RUNTIME_PROOF`
   Chybi i archivni runtime dukaz.

## Aktivni backlog podle priority

### P0

#### Users / Admin user management
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Evidence:
  - [apps/kajovo-hotel-api/app/api/routes/users.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/users.py)
  - [apps/kajovo-hotel-admin/src/main.tsx](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/src/main.tsx)
  - [apps/kajovo-hotel-api/tests/test_users.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/tests/test_users.py)
- Chybejici dukaz:
  Live API-backed smoke pro create, update, disable, delete a reset-link flow nad skutecnym API kontraktem po deploy.
- Dalsi krok:
  Pridat post-deploy nebo release smoke scenar svazany s testovacim admin uctem a pomocnym test user lifecycle.

#### Settings / SMTP settings management
- Stav v parity matrix: `NO`
- Kategorie dukazu: `NO_RUNTIME_PROOF`
- Evidence:
  - [apps/kajovo-hotel-api/app/api/routes/settings.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/settings.py)
  - [apps/kajovo-hotel-admin/src/main.tsx](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-admin/src/main.tsx)
  - [apps/kajovo-hotel-api/tests/test_smtp_email_service.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/tests/test_smtp_email_service.py)
- Chybejici dukaz:
  Produkcni runtime dukaz realneho SMTP transportu nelze tvrdit bez realneho kontrolovaneho mailboxu.
- Dalsi krok:
  Drzet stav jako `NO_RUNTIME_PROOF`, dokud nebude zaveden bezpecny provozni proof mailbox nebo schvalena staging transport verifikace.

### P1

#### Auth / Portal user login, forgot, reset
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Evidence:
  - [apps/kajovo-hotel-api/app/api/routes/auth.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/api/routes/auth.py)
  - [apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx)
  - [apps/kajovo-hotel-api/tests/test_auth_role_selection.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/tests/test_auth_role_selection.py)
- Chybejici dukaz:
  Live portal smoke s realnou session a potvrzenym redirect/login behavior po deploy.
- Dalsi krok:
  Pridat post-deploy portal smoke s testovacim portal userem nebo explicitne udrzovat stav jako `PARTIAL`.

#### Auth / Role-based module permissions
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Evidence:
  - [apps/kajovo-hotel-api/app/security/rbac.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/app/security/rbac.py)
  - [apps/kajovo-hotel-web/src/rbac.ts](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-web/src/rbac.ts)
  - [apps/kajovo-hotel-api/tests/test_rbac.py](/C:/GitHub/kajovo-hotel-monorepo/apps/kajovo-hotel-api/tests/test_rbac.py)
- Chybejici dukaz:
  Live runtime matrix pro vybrane role a zakazane/omezene moduly.
- Dalsi krok:
  Zvolit reprezentativni mini-matici role->povolene moduly a overit ji po deploy.

#### Reports / CRUD
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Dalsi krok:
  API-backed smoke na list/create/detail/update nad testovacim reportem.

#### Breakfast / Daily workflow
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Dalsi krok:
  Admin smoke na denni prehled, editaci poznamky a export proti realnemu API.

#### Lost&Found / CRUD
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Dalsi krok:
  API-backed smoke create/list/detail/delete.

#### Issues / CRUD
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Dalsi krok:
  API-backed smoke create/status/detail proti realnemu API.

#### Inventory / CRUD
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Dalsi krok:
  API-backed smoke create/movement/list pro prazdny sklad bez bootstrap dat.

### P2

#### Device / register-challenge-verify-token
- Stav v parity matrix: `NO`
- Kategorie dukazu: `NO_RUNTIME_PROOF`
- Poznamka:
  Na hotel.hcasc.cz neni verejna device UI surface, takze live proof neni automaticky release blocker.
- Dalsi krok:
  Rozhodnout, zda device flow potrebuje staging proof nebo zustane jako API-only domena bez produkcniho live smoke.

#### Reports / media authorization
- Stav v parity matrix: `NO`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Dalsi krok:
  Pokud bude potreba, doplnit autorizovany media smoke proti jednomu testovacimu reportu.

#### Inventory / ingredient-card split + pictograms
- Stav v parity matrix: `NO`
- Kategorie dukazu: `TEST_PROVEN_ONLY`
- Dalsi krok:
  Bud doplnit cileny visual/runtime proof, nebo explicitne ponechat jako semantic parity bez live proof.

#### Deploy / cutover rollback
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `ARCHIVAL_SMOKE_ONLY`
- Dalsi krok:
  Rozhodnout, zda je potreba cerstvy rollback rehearsal, nebo zustane script-based s historickou evidenci.

#### Ops / smoke verify backup restore
- Stav v parity matrix: `PARTIAL`
- Kategorie dukazu: `ARCHIVAL_SMOKE_ONLY`
- Dalsi krok:
  Odlistit, co je skutecny live proof a co je jen release gate artifact.

## Pravidla uzavreni polozky

Polozka smi byt prepnuta z `PARTIAL` nebo `NO` jen pokud:

1. existuje konkretni dukaz pro definovany SHA,
2. dukaz neni jen mocked test pass,
3. dukaz je uvedeny v parity matrix i v tomto backlogu,
4. runtime truth SSOT zustava s novym stavem v souladu.

## Dalsi vlny

1. Zvolit minimalni sadu modulu, kde live proof prinese nejvetsi snizeni rizika:
   - Users
   - Portal auth
   - Inventory
   - Breakfast
2. Pro kazdy modul navrhnout nejmensi bezpecny API-backed smoke bez fake dat.
3. Teprve po realnem dukazu menit `Runtime prokazano` v parity matrix.
