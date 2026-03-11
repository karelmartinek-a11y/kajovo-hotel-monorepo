# Forenzni audit repozitare - current state k 2026-03-11

Tento dokument je aktualni source of truth pro technicky stav monorepa po dokonceni P0, P1 a finalni P2 cleanup vlny.

Historicke dokumenty:

- `docs/forensic-audit-2026-03-11-deep.md`
- `docs/remediation-plan-2026-03-11-by-module.md`
- `docs/remediation-task-breakdown-2026-03-11.md`

Tyto soubory zustavaji jako auditni stopa, ale uz nepopisuji aktualni stav repa.

## Exekutivni verdict

Repo uz neni "frontend demo nad maketami" ani "realny backend s demo operacni vrstvou". Po finalni cleanup vlne plati:

- backend je realny a persistentni,
- auth, session, admin identity i revokace jsou backend-driven,
- device lifecycle, report media a self-service profile/password parity jsou implementovane,
- web i standalone admin frontend jsou napojene na realne API,
- admin dashboard uz neni hardcoded KPI plocha,
- housekeeping admin route uz neni slepy stub,
- inventory bootstrap je zavreny za explicitni non-production flag,
- SMTP status je operatorovi citelne priznan jako `smtp` vs `mock`.

Aktualni verdikt:

**System je realne provozovatelny a parity-kriticke i drive otevrene operational P2 mezery jsou uzavrene. Release gate a tooling hygiena jsou uklizene. Po dorovnani inventory card modelu, ops hardeningu a odstraneni legacy mail ingestu pro snidane zustava v parity matrix uz jen 1 jemna `PARTIAL` polozka: dedicated report done/reopen commands.**

## Co bylo overeno v teto finalni vlne

### Zdrojovy kod

Byly znovu krizove porovnany:

- `apps/kajovo-hotel-api`
- `apps/kajovo-hotel-web`
- `apps/kajovo-hotel-admin`
- `packages/shared`
- `docs`
- `scripts/run-playwright-with-api.js`

### Backend a testy

Overeno v tomto behu:

- `python -m pytest apps/kajovo-hotel-api/tests/test_inventory.py apps/kajovo-hotel-api/tests/test_smtp_email_service.py -q`
  - vysledek: `6 passed`
- `python -m pytest apps/kajovo-hotel-api/tests -q`
  - vysledek: `59 passed`

### Frontend a UI gate

Overeno v tomto behu:

- `pnpm --filter @kajovo/kajovo-hotel-admin lint`
- `pnpm ci:gates`
  - vysledek: `token lint passed`, `brand asset lint passed`, `3 passed`, `1 passed`, `1 passed`, `7 passed`, `5 passed`
- `node scripts/run-playwright-with-api.js --app apps/kajovo-hotel-admin tests/operations-cleanup.spec.ts tests/rbac-access.spec.ts tests/profile.spec.ts tests/users-admin.spec.ts tests/auth-smoke.spec.ts tests/e2e-smoke.spec.ts --project=desktop`
  - vysledek: `18 passed`

Predchozi current-state evidence pro web a admin CI/UI gates zustava platna; tato finalni vlna nemenila web runtime ani shared UI primitives mimo admin operacni plochy.

## Co je dnes prokazatelne hotove

### Auth a session vrstva

- frontendy nefallbackuji na `anonymous/recepce`,
- auth stav je explicitni `authenticated | unauthenticated | error`,
- session je server-side evidovana v `auth_sessions`,
- logout a user lifecycle umi session revokovat,
- admin login uz neni ENV-only credential, ale DB user s roli `admin`,
- portal i admin maji self-service profile/password flow.

### Legacy parity, ktera byla drive vedena jako missing

- `device register/status/challenge/verify`
- report photo upload/list/file access
- admin profile/password
- portal self-service password change
- admin/session model bez pseudoidentity fallbacku

### Admin source of truth

Autoritativni admin frontend je `apps/kajovo-hotel-admin`.

Web runtime uz na `/admin/*` nenese druhy zivy admin povrch, ale retirement gateway. Drift "dva aktivni admin povrchy" byl odstraneny na urovni runtime chovani.

### Finalni P2 cleanup

#### Admin dashboard KPI

Soubor:

- `apps/kajovo-hotel-admin/src/main.tsx`

Stav:

- dashboard overview uz neni hardcoded showcase,
- KPI karty se skladaji z realnych dat z breakfast, issues, inventory, reports a lost_found endpointu.

#### Housekeeping admin route

Soubor:

- `apps/kajovo-hotel-admin/src/main.tsx`

Stav:

- route `/pokojska` uz neni mrtvy stub,
- je nahrazena zivou operacni handoff plochou s aktualnim prehledem a odkazy do realnych modulu.

#### Inventory bootstrap

Soubory:

- `apps/kajovo-hotel-api/app/api/routes/inventory.py`
- `apps/kajovo-hotel-api/app/config.py`
- `apps/kajovo-hotel-admin/src/main.tsx`

Stav:

- `seed-defaults` uz neni implicitne produkcne dostupny,
- route je zavrena za `KAJOVO_API_INVENTORY_SEED_ENABLED=true`,
- admin UI zobrazuje bootstrap helper jen kdyz ho backend explicitne povoli,
- canned supplier text byl odstraneny z default katalogu.

#### SMTP operational clarity

Soubory:

- `apps/kajovo-hotel-api/app/api/routes/settings.py`
- `apps/kajovo-hotel-api/app/db/models.py`
- `apps/kajovo-hotel-api/app/api/schemas.py`
- `apps/kajovo-hotel-admin/src/main.tsx`

Stav:

- admin API exposeuje provozni SMTP status,
- UI rozlisuje `Realne SMTP` vs `Mock / no-op`,
- system uklada vysledek posledniho testu, cas, prijemce a chybu,
- operator uz nevidi jen "SMTP existuje", ale i jestli realne odesilani muze fungovat.

## UI ergonomie a kosmetika - forenzni verdict

### Web

Na web IA routech je prokazatelne overeno:

- vsechny hlavni routy jsou navigovatelne,
- signace zustava viditelna a neprekryta,
- page nema horizontal overflow mimo tabulkove kontejnery,
- reduced motion vypina skeleton animaci,
- WCAG 2.2 AA baseline pro desktop projekt prochazi,
- auth/rbac flow nepousti neprihlaseneho klienta dovnitr.

Forenzni zaver pro web:

**Web uz neni QA-kontaminovany runtime. Ergonomie hlavnich i vedlejsich pohledu je robustni v ramci aktualni IA.**

### Admin

Na admin IA routech je prokazatelne overeno:

- smoke navigation,
- auth/profile/users flows nad realnym backendem,
- dashboard operacni overview bez fake KPI,
- housekeeping handoff view misto stub route,
- inventory bootstrap signalizace podle backend policy,
- SMTP operational status v UI,
- signace, brand element limity a reduced motion,
- WCAG 2.2 AA baseline.

Forenzni zaver pro admin:

**Admin je funkcne i operacne robustni. Drivejsi presentation debt na dashboardu a housekeeping surface byl odstranen.**

## Zdrojovy kod - forenzni verdict

### Backend

Verdikt:

**Realny a robustni.**

Pozitivni body:

- CRUD moduly nejsou fake,
- session store a revokace jsou realne,
- admin identity model je zaintegrovany do DB user modelu,
- report media a device lifecycle jsou doplnene,
- inventory bootstrap je explicitne guardovany,
- SMTP operational status je auditovatelny,
- full API suite prochazi.

### Frontend

Verdikt:

**Robustni, bez drivejsich demo fallbacku a bez otevreneho P2 operacniho dluhu.**

Pozitivni body:

- web i admin ctou realny auth profil z `/api/auth/me`,
- pseudoidentity fallback je odstraneny,
- admin embedded surface je runtime retired,
- self-service profile/password funguje v obou UI,
- admin dashboard a vedlejsi operacni pohledy uz nejsou fake/stub.

## Dokumentace a testy - forenzni verdict

### Dokumentace

Aktualni auditni truth je tento dokument. Historicke audity zustavaji zachovane jako stopa, ale nesmi byt brany jako aktualni verdict bez tohoto current-state updatu.

### Testy

Stav:

- API regrese pokryva auth, users, device, reports, inventory i SMTP status flow,
- admin Playwright ma samostatnou operacni cleanup regresi,
- smoke a RBAC testy bezi nad realnym API,
- kriticky desktop screenshot baseline je soucasti `pnpm ci:gates`,
- plny multi-viewport screenshot matrix zustava dostupny jako rozsireny opt-in sweep pres `VISUAL_SNAPSHOTS=1`.

Verdikt:

**Test coverage je dostatecna pro provozni duveru. Kriticka vizualni baseline je uz release gate.**

## Finalni zaverecny verdikt

Po plne forenzni kontrole aktualniho repozitare plati:

**Neni nutna regenerace architektury. Repo je po remediation a finalni P2 cleanup vlne konzistentni, backendove realne, UI-forenzne verifikovane a dokumentacne srovnane. Otevrene zustavaji uz jen jemne legacy-fidelity a operations-hardening polozky z parity matrix, ne runtime nebo demo integritni mezery.**
