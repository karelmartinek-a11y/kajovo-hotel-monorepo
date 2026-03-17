# 1. Titulek a datum auditu

KájovoHotel Android forenzní audit repo a KDGS

Datum auditu: 2026-03-16
Datum posledního ověření proti aktuální repo revizi: 2026-03-16

# 2. Auditované vstupy

- ZIP repozitáře: `kajovo-hotel-monorepo-main (5).zip`, rozbalený do pracovního repozitářového rootu.
- Kontrolní porovnání s předchozí dodávkou podkladů: `kajovo-hotel-monorepo-main_android-docs-updated.zip`.
- Root a workspace: `README.md`, `package.json`, `pnpm-workspace.yaml`, `.github/workflows/*`, `apps/*`, `packages/*`, `docs/*`, `scripts/*`.
- Závazný current-state standard: `docs/Kajovo_Design_Governance_Standard_SSOT.md`.
- Aktivní current-state docs: `docs/README.md`, `docs/release-checklist.md`, `docs/rbac.md`.
- Doplňující forenzní current-state důkaz pro auth delta: `docs/forensic-self-service-reset-hesla-2026-03-16.md`.
- Design a UX zdroje: `ManifestDesignKájovo.md`, `apps/kajovo-hotel/brand/brand.json`, `apps/kajovo-hotel/palette/palette.json`, `apps/kajovo-hotel/ui-motion/motion.json`, `apps/kajovo-hotel/ui-tokens/tokens.json`, `apps/kajovo-hotel/ux/ia.json`, `apps/kajovo-hotel/ux/done.json`, `apps/kajovo-hotel/ux/content.json`.
- Frontend user scope: `apps/kajovo-hotel-web/src/main.tsx`, `apps/kajovo-hotel-web/src/portal/*`, `apps/kajovo-hotel-web/src/rbac.ts`, `apps/kajovo-hotel-web/src/routes/utilityStates.tsx`.
- Admin audit pouze kvůli scope separaci: `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-web/src/admin/*`.
- Backend a kontrakt: `apps/kajovo-hotel-api/openapi.json`, `apps/kajovo-hotel-api/app/api/routes/*`, `apps/kajovo-hotel-api/app/security/auth.py`, `apps/kajovo-hotel-api/app/security/rbac.py`, `apps/kajovo-hotel-api/app/db/models.py`, `packages/shared/src/generated/client.ts`, `docs/api-contract.md`.
- CI a quality: `docs/testing.md`, `docs/release-checklist.md`, `.github/workflows/ci-gates.yml`, `.github/workflows/ci-core.yml`, `apps/kajovo-hotel/ci/*`.

# 3. Repo mapa

## Root struktura

Repo je pnpm monorepo s React/Vite frontendem, FastAPI backendem a shared balíčky.

Hlavní části rootu:

- `apps/`
- `packages/`
- `docs/`
- `brand/`
- `signace/`
- `infra/`
- `legacy/`
- `.github/workflows/`
- `ManifestDesignKájovo.md`
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- pomocné auditní/log soubory v rootu (`audit_*`, `kaskadaORF.txt`, `normUTF.spec`) bez potvrzené current-state autority

## Rozdělení aplikací a balíčků

- `apps/kajovo-hotel-web` = portal web pro neadmin uživatele
- `apps/kajovo-hotel-admin` = samostatná admin aplikace
- `apps/kajovo-hotel-api` = backend API, session auth, RBAC enforcement
- `apps/kajovo-hotel` = brand, tokeny, UX, CI guardy a design metadata
- `packages/shared` = sdílené typy, RBAC helpery, auth bundle, generated client
- `packages/ui` = UI shell a komponenty

# 4. Aktivní dokumenty a jejich autorita

## Aktivní závazné dokumenty

`docs/README.md` výslovně určuje jako aktivní závazné dokumenty:

- `docs/Kajovo_Design_Governance_Standard_SSOT.md`
- `docs/release-checklist.md`
- `docs/rbac.md`

## Autorita

1. `docs/Kajovo_Design_Governance_Standard_SSOT.md` je nejvyšší autorita pro brand, UI, ergonomii, layout, kvalitu finálního výstupu a pravdivost výstupu.
2. `docs/release-checklist.md` je current-state autorita pro release quality a utility-state coverage.
3. `docs/rbac.md` je current-state autorita pro auth/RBAC model a je srovnaný s backend runtime permission mapou i `packages/shared`.
4. `README.md` stále označuje `ManifestDesignKájovo.md` jako design SSOT, ale `docs/README.md` nově dává current-state autoritu `docs/Kajovo_Design_Governance_Standard_SSOT.md`. V konfliktu má přednost KDGS.
5. Ostatní docs a root artefakty jsou podpůrné nebo historické. Bez dalšího ověření nejsou current-state autoritou.

# 5. Zjištěné aplikace, balíčky a odpovědnosti

## `apps/kajovo-hotel-web`

Portal frontend pro actor type `portal`.

Ověřeně obsahuje:

- portal login
- role selection pro multi-role session
- portal shell, navigaci a utility states
- profil portálového uživatele
- doménové screeny pro snídaně, ztráty a nálezy, závady, sklad, pokojská flow
- v kódu jsou i routy pro dashboard a reports, ale nejsou doložené jako dostupné pro žádnou neadmin roli
- minimální „retired“ admin surface pouze jako odkaz na samostatnou admin appku

## `apps/kajovo-hotel-admin`

Samostatná admin aplikace.

Ověřeně obsahuje:

- admin login
- admin dashboard
- `/uzivatele`
- `/nastaveni`
- admin profil
- admin role-view switching do portal-like modů

## `apps/kajovo-hotel-api`

FastAPI backend.

Ověřeně obsahuje:

- session-backed auth a CSRF
- `/api/auth/*`
- user-scope moduly breakfast, lost-found, issues, inventory, reports
- admin endpoints pro uživatele, admin profil a SMTP nastavení
- OpenAPI kontrakt v `openapi.json`

## `apps/kajovo-hotel`

SSOT oblast pro:

- brand assety
- palette
- motion
- tokeny
- UX IA/content/done kritéria
- CI guardy

## `packages/shared`

- auth copy bundle
- RBAC helpery a role aliasy
- generated typed client z OpenAPI

## `packages/ui`

- AppShell
- KajovoSign
- RoleSwitcher
- StateView
- sdílené tokeny a shell behavior

# 6. Zjištěné role bez adminu

## Ověřeně nalezené neadmin role pro actor type `portal`

- `recepce`
- `pokojská` / `pokojska`
- `údržba` / `udrzba`
- `snídaně` / `snidane`
- `sklad`

## Aliasy a normalizace

Frontend i backend obsahují aliasy pro anglické názvy rolí jako `reception`, `housekeeping`, `maintenance`, `breakfast`, `warehouse`.

## Current-state rozpor

Role naming a permission matrix nejsou plně sjednocené mezi:

- `docs/rbac.md`
- `packages/shared/src/rbac.ts`
- `apps/kajovo-hotel-api/app/security/rbac.py`

Proto je nutné odlišovat deklarovaný záměr od ověřené runtime reality.

# 7. Zjištěné user moduly a use-cases

## Ověřeně přítomné moduly a screeny v portal web kódu

### Auth a session shell

- portal login screen
- role selection pro multi-role session
- profil `/profil`
- utility routes `/intro`, `/offline`, `/maintenance`, `/404`

### Recepce hub

- route `/recepce`
- specializovaný rozcestník do snídaní a ztrát a nálezů

### Pokojská flow

- route `/pokojska`
- jeden formulář se dvěma režimy: založení závady nebo založení lost-found položky
- upload až 3 fotografií
- current-state je to quick capture flow, ne plnohodnotný browse/manage modul

### Snídaně

Routes v portal web kódu:

- `/snidane`
- `/snidane/nova`
- `/snidane/:id`
- `/snidane/:id/edit`

Ověřeně nalezené use-cases v kódu a backendu:

- list objednávek pro datum
- daily summary
- search
- PDF import + import preview
- úprava dietních flagů
- označení jako vydané / reaktivace
- detail objednávky
- vytvoření a editace objednávky
- export denního PDF
- mazání po dni a období existuje v backendu, ale je role-limitované

### Ztráty a nálezy

Routes:

- `/ztraty-a-nalezy`
- `/ztraty-a-nalezy/novy`
- `/ztraty-a-nalezy/:id`
- `/ztraty-a-nalezy/:id/edit`

Ověřeně nalezené use-cases:

- list s filtry
- detail
- create/edit
- recepční režim čekajících nálezů
- označení jako zpracované
- upload fotografií a thumbnail workflow

### Závady

Routes:

- `/zavady`
- `/zavady/nova`
- `/zavady/:id`
- `/zavady/:id/edit`

Ověřeně nalezené use-cases:

- list s filtry
- detail
- create/edit screen v portálu existuje
- maintenance režim pro otevřené závady
- upload fotografií a thumbnail workflow

Poznámka: backend create/update omezuje, co může skutečně dělat která role.

### Sklad

Routes v portal web kódu:

- `/sklad`
- `/sklad/nova`
- `/sklad/:id`
- `/sklad/:id/edit`

Ověřeně nalezené use-cases:

- list položek skladu
- zadání skladového pohybu přímo z listu
- create/detail/edit screeny existují v portálovém kódu
- inventory media workflow pro pictogram existuje v backendu

Poznámka: backend guardy dělají z detailu, create/edit, delete a stocktake exportu admin-only flow. Portal kód a backend zde nejsou v souladu.

### Dashboard a reports v portálovém kódu

V `apps/kajovo-hotel-web` existují komponenty a routy pro:

- dashboard `/`
- reports `/hlaseni`, `/hlaseni/nove`, `/hlaseni/:id`, `/hlaseni/:id/edit`

Current-state závěr pro neadmin user scope:

- dashboard route je v portálu renderovaná jen tehdy, když `primaryRoute === '/'`, což při ověřených neadmin read permission není splněno
- reports modul je v portálovém kódu přítomen, ale žádná neadmin role nemá v ověřeném backend permission setu `reports:read`
- obě plochy tedy nejsou doložené jako aktivně dosažitelný non-admin user scope

## Ověřeně dosažitelný non-admin scope podle backend permission reality

Backend `/api/auth/me` vrací permission set z `apps/kajovo-hotel-api/app/security/rbac.py`. Tím je doložená current-state dostupnost modulů pro neadmin role:

- `recepce` -> `breakfast`, `lost_found`
- `pokojská` -> `housekeeping`
- `údržba` -> `issues`
- `snídaně` -> `breakfast`
- `sklad` -> `inventory`

Profile, role selection a utility states jsou součástí společného portal shellu.

# 8. User scope vs admin scope

## Verified user scope pro budoucí native Android user app

Do current-state user scope patří to, co je pro actor type `portal` skutečně doložené v repu a současně není čistě admin:

- portal login
- session restore přes `/api/auth/me`
- active role selection
- profil `/profil`
- utility states `/intro`, `/offline`, `/maintenance`, `/404`
- recepce hub `/recepce`
- pokojská flow `/pokojska`
- snídaně `/snidane` a role-limitované podroute
- ztráty a nálezy `/ztraty-a-nalezy` a podroute
- závady `/zavady` a podroute
- sklad `/sklad` a inventory movement flow z listu

## Verified current-state role scope

### `recepce`

- `/recepce`
- `/profil`
- `/snidane`
- `/snidane/nova`
- `/snidane/:id`
- `/snidane/:id/edit`
- `/ztraty-a-nalezy`
- `/ztraty-a-nalezy/novy`
- `/ztraty-a-nalezy/:id`
- `/ztraty-a-nalezy/:id/edit`
- utility routes

### `pokojská`

- `/profil`
- `/pokojska`
- utility routes

### `údržba`

- `/profil`
- `/zavady`
- `/zavady/:id`
- `/zavady/:id/edit`
- utility routes

Poznámka: route `/zavady/nova` v portálu existuje, ale backend create guard ji pro roli `údržba` nepodporuje.

### `snídaně`

- `/profil`
- `/snidane`
- utility routes

Poznámka: shared frontend naznačuje i inventory modul, ale backend permissions vracené přes `/api/auth/me` ho pro roli `snídaně` aktuálně nedokládají.

### `sklad`

- `/profil`
- `/snidane`
- `/sklad`
- utility routes

Poznámka: portal kód má i `/sklad/:id`, ale backend dělá detail admin-only. Verified current-state bez backend změny tedy nedokládá použitelný non-admin inventory detail screen.

## Mimo scope budoucí user Android appky

- `apps/kajovo-hotel-admin`
- `/uzivatele`
- `/nastaveni`
- admin profil a admin login/logout flow
- `/api/auth/admin/*`
- `/api/v1/users*`
- `/api/v1/admin/profile*`
- `/api/v1/admin/settings/smtp*`

## Portal kód přítomný, ale mimo verified non-admin scope

- dashboard `/`
- reports `/hlaseni*`
- inventory detail/create/edit, pokud má zůstat bez backend změn a bez admin role

# 9. Auth/session/role-switching zjištění

## Login

### Portal login

- endpoint: `POST /api/auth/login`
- identita: email + password
- backend vytváří server-side session record v `auth_sessions`
- klient dostává cookie `kajovo_session` a `kajovo_csrf`
- actor type je `portal`
- single-role user dostane `active_role` hned při loginu
- multi-role user dostane `active_role = null` a musí zvolit roli

### `/api/auth/me`

- vrací `email`, `role`, `roles`, `active_role`, `permissions`, `actor_type`
- frontend mapuje `401` a `403` na `unauthenticated`
- žádný lokální pseudo-user fallback nebyl nalezen

## Active role selection

- endpoint: `POST /api/auth/select-role`
- vyžaduje CSRF header z `kajovo_csrf`
- backend uloží `active_role` do session recordu
- guardované přístupy bez aktivní role vrací `403 Active role must be selected`

## Logout

- endpoint existuje: `POST /api/auth/logout`
- backend revokuje aktuální session a smaže cookies
- v auditovaném portal web kódu nebyl nalezen potvrzený user-facing logout trigger
- current-state jde o `GAP` mezi backend capability a portal surface

## Profil a změna hesla

- `GET /api/auth/profile`
- `PATCH /api/auth/profile`
- `POST /api/auth/change-password`
- change-password po úspěchu revokuje sessiony uživatele a smaže cookies
- portal web po změně hesla naviguje na login

## Reset hesla / unlock / admin-init flow

- portal login page už nepoužívá `POST /api/auth/forgot-password` a místo toho explicitně říká, že reset hesla odesílá administrátor ze správy uživatelů
- admin správa uživatelů vystavuje reset link přes `POST /api/v1/users/{user_id}/password/reset-link`
- reset link míří na veřejnou route `/login/reset?token=...`
- veřejné dokončení resetu je doložené přes `POST /api/auth/reset-password` s `token + new_password`
- `GET /api/auth/unlock` zůstal oddělený pouze pro unlock tokeny `purpose = "unlock"`
- `POST /api/v1/users/{user_id}/unlock` nově umožňuje ruční admin odblokování účtu

## Session validace a revokace

- session validity se kontroluje proti DB `auth_sessions`
- session se invaliduje při expiraci nebo revokaci
- `_validate_portal_session` invaliduje session i při disable user, změně emailu nebo změně role assignmentu
- CSRF je vynucováno pro write requesty kromě loginu, admin hint, reset-password a device API

## Revokace a reset session po auth delta

- `POST /api/auth/reset-password` nově volá `revoke_sessions_for_portal_user`
- resetovací tokeny používají oddělený `purpose = "password_reset"`
- unlock tokeny používají `purpose = "unlock"`
- current-state evidence tedy nově potvrzuje oddělení unlock flow a password-reset flow i okamžitou session revokaci po resetu hesla

## Vhodnost pro native Android bez backend změn

- pro login, session restore, role selection a většinu běžných CRUD flow je model použitelný, pokud Android klient zvládne cookie session a CSRF header
- model není token-first ani mobile-specific
- admin-init password reset completion je backendově doložený jako kompletní native-ready flow, ale není to self-service request z loginu

# 10. Backend/API readiness pro Android user app

## Kontrakt

- canonical API contract: `apps/kajovo-hotel-api/openapi.json`
- generated typed client: `packages/shared/src/generated/client.ts`
- kontrakt je vynucovaný přes `contract:check`
- OpenAPI obsahuje 59 path položek

## Endpointy potřebné pro verified non-admin user scope

### Auth a session

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/select-role`
- `GET /api/auth/profile`
- `PATCH /api/auth/profile`
- `POST /api/auth/change-password`
- `POST /api/auth/reset-password` jako admin-init reset completion flow
- `GET /api/auth/unlock` pouze jako unlock flow

### Breakfast

- `GET /api/v1/breakfast`
- `GET /api/v1/breakfast/daily-summary`
- `GET /api/v1/breakfast/{order_id}`
- role-limitovaně: `POST /api/v1/breakfast`, `PUT /api/v1/breakfast/{order_id}`, `POST /api/v1/breakfast/import`, `POST /api/v1/breakfast/reactivate-all`, `GET /api/v1/breakfast/export/daily`, `DELETE /api/v1/breakfast/day/delete`

Poznámka: `DELETE /api/v1/breakfast/period/delete` je admin-only.

### Lost & found

- `GET /api/v1/lost-found`
- `GET /api/v1/lost-found/{item_id}`
- `POST /api/v1/lost-found`
- `PUT /api/v1/lost-found/{item_id}`
- `GET /api/v1/lost-found/{item_id}/photos`
- `POST /api/v1/lost-found/{item_id}/photos`
- `GET /api/v1/lost-found/{item_id}/photos/{photo_id}/{kind}`

Poznámka: delete je admin-only a recepce má omezené update pole.

### Issues

- `GET /api/v1/issues`
- `GET /api/v1/issues/{issue_id}`
- `PUT /api/v1/issues/{issue_id}` role-limitovaně
- `GET /api/v1/issues/{issue_id}/photos`

Pro quick-capture flow pokojské navíc:

- `POST /api/v1/issues`
- `POST /api/v1/issues/{issue_id}/photos`

Poznámka: issue create je backendem omezené na `admin` nebo `pokojská`. Maintenance umí list/detail a omezené status update.

### Inventory

Bez backend změn je pro verified non-admin scope doloženo:

- `GET /api/v1/inventory`
- `POST /api/v1/inventory/{item_id}/movements`

V kontraktu dále existují, ale pro current non-admin user scope nejsou bezpečně doložené jako použitelné:

- `GET /api/v1/inventory/{item_id}` -> backend admin-only
- `POST /api/v1/inventory` -> backend admin-only
- `PUT /api/v1/inventory/{item_id}` -> backend admin-only
- `DELETE /api/v1/inventory/{item_id}` -> backend admin-only
- `DELETE /api/v1/inventory/{item_id}/movements/{movement_id}` -> backend admin-only
- `POST /api/v1/inventory/{item_id}/pictogram` -> backend admin-only
- `GET /api/v1/inventory/stocktake/pdf` -> backend admin-only

`GET /api/v1/inventory/ingredients`, `GET /api/v1/inventory/movements`, `GET/POST /api/v1/inventory/cards`, `GET /api/v1/inventory/cards/{card_id}` v kontraktu existují, ale v auditované non-admin portal části nebyl doložený stabilní user-facing use-case.

### Reports

Reports API v backendu existuje, ale v ověřeném non-admin permission modelu nebyla nalezena role s `reports:read`. Bez další změny RBAC tedy nejde o verified current-state user Android scope.

## Co je dostatečné

- login / me / select-role / profile / change-password existují
- breakfast flow je backendově přítomný včetně summary, importu a exportu
- lost-found flow je backendově přítomný včetně media
- issues flow je backendově přítomný včetně media a role-specific guardů
- inventory list + movement submit jsou backendově přítomné
- OpenAPI a generated client existují

## Co chybí nebo je nejasné

- password reset completion je nyní doložený, ale request fáze je admin-init a není součástí neadmin self-service login UX
- RBAC kontrakt je dnes srovnaný mezi docs, shared frontendem a backendem; pro Android ale dál platí, že route-level guardy jsou jemnější než samotná role-module mapa
- inventory detail/create/edit screeny přítomné v portálovém kódu nejsou backend-ready pro non-admin role
- reports modul je v portálovém kódu přítomný, ale bez non-admin read permission
- device API (`/api/v1/device/*`) existuje, ale v auditované user části nebyl doložený runtime use-case

# 11. UI/UX, utility states, quality gates a KDGS relevantní omezení

## KDGS omezení relevantní pro budoucí Android appku

- WebView-first, hybrid wrapper nebo zabalený web není validní směr.
- Každé view musí mít alespoň jeden validní brand prvek.
- Maximum 2 brand prvky na view, pokud není výslovně zdůvodněno jinak.
- Povinné stavy: default, relevantní hover/active/focus, loading, empty, error, offline nebo maintenance, 404/fallback, responsive varianty.
- Token-only styling.
- Základní grid `8 pt`.
- Touch hit target minimálně `44 × 44 px`.
- Přístupnost minimálně `WCAG 2.2 AA`.
- Viditelný focus ring.
- Žádný neřízený overflow ani geometrický rozpad.
- Release je blokovaný při porušení brandu, utility states, tokenů nebo ergonomie.

## Ověřené UX a IA signály z repa

- `ia.json` definuje sekce `overview`, `operations`, `records`.
- `ia.json` definuje max 6 top-level položek desktop a max 4 tablet.
- `tokens.json` definuje breakpointy `sm`, `md`, `lg`, `xl`.
- `tokens.json` a `ia.json` vyžadují fixovanou levodole umístěnou SIGNACE.
- `motion.json` vyžaduje respektovat `prefers-reduced-motion`.

## Utility states

Repo explicitně obsahuje utility routes a release checklist je chrání:

- `/intro`
- `/offline`
- `/maintenance`
- `/404`

## CI / release gates již vynucované repem

- `pnpm ci:tokens`
- `pnpm ci:brand-assets`
- `pnpm ci:text-integrity`
- `pnpm ci:frontend-manifest`
- `pnpm ci:runtime-integrity`
- `pnpm ci:web-smoke`
- `pnpm ci:policy`
- `pnpm contract:check`
- lint, typecheck, backend unit tests, Playwright smoke a e2e smoke
- `.github/workflows/ci-gates.yml` joby `release-gate`, `e2e-smoke`, `guardrails`, `lint`, `typecheck`, `unit-tests`

## Ergonomické požadavky z repa relevantní pro Android

- SIGNACE musí zůstat viditelná a nepřekrytá.
- Nesmí vznikat globální horizontální scroll mimo explicitní table wrappery.
- Skeletony musí držet layout bez skoku.
- Utility states musí mít recovery akci.
- Create/edit/detail workflows jsou v release checklistu smoke-testované tam, kde jsou skutečně podporované.

# 12. Ověřená fakta

- Repo je monorepo s appkami `kajovo-hotel-web`, `kajovo-hotel-admin`, `kajovo-hotel-api` a se shared balíčky `@kajovo/shared` a `@kajovo/ui`.
- `docs/README.md` určuje jako aktivní závazné dokumenty KDGS, release checklist a RBAC.
- KDGS je current-state nejvyšší autorita.
- Portal login page volá `POST /api/auth/login` a už nenabízí self-service forgot flow; uvádí admin-init reset instrukci.
- Identity restore je řešen přes `GET /api/auth/me`.
- Multi-role portal user vybírá aktivní roli přes `POST /api/auth/select-role`.
- Backend je session-backed a používá cookies `kajovo_session` a `kajovo_csrf`.
- `POST /api/auth/change-password` explicitně revokuje sessiony portálového uživatele.
- `POST /api/auth/logout` endpoint existuje, ale v auditovaném portal web kódu nebyl nalezen potvrzený UI trigger.
- `POST /api/auth/reset-password` + `/login/reset` nově tvoří doložený completion flow pro adminem vystavený reset link; `GET /api/auth/unlock` zůstává samostatný unlock flow.
- `apps/kajovo-hotel-web` obsahuje routy pro dashboard a reports, ale žádná neadmin role nemá v ověřené backend permission realitě `dashboard:read` nebo `reports:read`.
- Inventory detail a stocktake export jsou v backendu admin-only.
- Lost-found delete a issues delete jsou admin-only.
- `apps/kajovo-hotel-admin` obsahuje admin-only moduly `/uzivatele` a `/nastaveni`.

# 13. Odvození

- Budoucí native Android user appka má být navržená pro actor type `portal`, ne pro admin appku.
- Bezpečný current-state scope je menší než množina všech screenů přítomných v portal web kódu, protože část screenů není doložená jako dosažitelná pro žádnou neadmin roli.
- Android může použít stávající backend bez zásahu pro login, session restore, role selection, admin-init reset completion a většinu snídaňových, lost-found a issue flow.
- Inventory bez backend změn je pro non-admin realisticky jen list + movement submit, nikoli plný detail/create/edit.
- Reports modul nelze bez RBAC změny nebo bez nové doložené role považovat za součást non-admin Android scope.
- Pokojská flow je v current-state quick capture specializace, nikoli obecný modulový browse flow.
- Návrh Androidu musí být role-aware a musí obsahovat utility states od začátku, ne až dodatečně.

# 14. Gapy a rizika

## GAP: route/document drift
`apps/kajovo-hotel/ux/done.json` obsahuje route názvy neodpovídající live portal routingu, například `/dashboard`, `/snidane/novy`, `/snidane/:id/upravit`, `/sklad/nova-polozka`, `/sklad/pohyb`.

## GAP: self-service password reset request

Veřejný portal auth surface záměrně nenabízí request resetu hesla. Current-state model je admin-init reset link a veřejné dokončení resetu přes token.

## GAP: logout UX surface

Backend logout endpoint existuje, ale v auditovaném portal web kódu nebyl potvrzený logout trigger pro běžného uživatele.

## RISK: inventory route/backend mismatch

Portal kód obsahuje non-admin inventory detail/create/edit routy, ale backend dělá detail/create/edit/admin export admin-only. Bez explicitního rozhodnutí nelze tyto plochy převzít do Android scope jako hotovou pravdu.

## RISK: reports route/backend permission mismatch

Portal kód obsahuje reports screeny, ale v ověřené backend permission realitě nemá žádná neadmin role `reports:read`.

## RISK: issues create mismatch pro `údržba`

Portal route `/zavady/nova` existuje obecně pro issues modul, ale backend create guard umožňuje create jen `admin` nebo `pokojská`. Pro roli `údržba` jde tedy o route/backend nesoulad.

## RISK: route-level capability drift

Shared RBAC mapa je dnes srovnaná s backendem, ale route-level guardy jsou jemnější než základní role-module mapa. To se týká hlavně breakfast manager akcí, issue create/update hran a non-admin inventory detailu.

# 15. Blockers

# 16. Doporučení pro další krok

- Generovat technický návrh pouze pro actor type `portal` a explicitně vynechat admin appku i admin endpointy.
- V návrhu použít jako current-state pravdu backend permission realitu vracenou přes `/api/auth/me` a backend guardy, ne pouze starší docs nebo samotnou přítomnost route v portálovém kódu.
- V návrhu zavést role-aware screen matrix pro `recepce`, `pokojská`, `údržba`, `snídaně`, `sklad`.
- Auth navrhovat jako cookie-session + CSRF klienta, protože to je prokazatelný současný backend kontrakt.
- Reports a non-admin inventory detail/create/edit nebrat bez dalšího jako scope baseline.
- Do dalšího kroku přenést jako povinný otevřený bod: potvrdit business scope Android v1 po modulech, protože technický RBAC drift je už srovnaný.
