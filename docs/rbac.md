# RBAC

## Zdroj pravdy

Autorizační kontrakt je session-based a kanonický zdroj pravdy je backend:

- runtime pravidla: `apps/kajovo-hotel-api/app/security/rbac.py`
- session validace a výběr aktivní role: `apps/kajovo-hotel-api/app/security/auth.py`
- frontend mirror pro navigaci a lokální fallbacky: `packages/shared/src/rbac.ts`

Web i admin načítají identitu přes `/api/auth/me`. Neplatná nebo chybějící session nepadá do lokální pseudo-identity.

## Typy aktérů

Systém rozlišuje dva typy session:

- `admin`
- `portal`

`admin` session vždy běží jako role `admin`.

`portal` session může nést více rolí. Pokud má uživatel přiřazeno více portálových rolí, musí před přístupem do hlídaných modulů zvolit `active_role`.

## Kanonické role

Kanonické názvy rolí jsou:

- `admin`
- `pokojská`
- `údržba`
- `recepce`
- `snídaně`
- `sklad`

Aliasy jako `housekeeping`, `maintenance`, `reception`, `breakfast`, `warehouse`, `pokojska`, `udrzba` nebo `snidane` se při načtení normalizují na tuto českou sadu.

## Permission matice

Permission používají formát `<modul>:<akce>`, kde akce je `read` nebo `write`.

### `admin`

- `dashboard:read`
- `housekeeping:read`
- `breakfast:read`, `breakfast:write`
- `lost_found:read`, `lost_found:write`
- `issues:read`, `issues:write`
- `inventory:read`, `inventory:write`
- `reports:read`, `reports:write`
- `users:read`, `users:write`
- `settings:read`, `settings:write`

### `pokojská`

- `housekeeping:read`
- `issues:write`
- `lost_found:write`

### `údržba`

- `issues:read`, `issues:write`

### `recepce`

- `breakfast:read`, `breakfast:write`
- `lost_found:read`, `lost_found:write`

### `snídaně`

- `breakfast:read`, `breakfast:write`

### `sklad`

- `inventory:read`, `inventory:write`

## Odvozená module mapa ve frontendu

`packages/shared/src/rbac.ts` odvozuje `ROLE_MODULES` přímo z `ROLE_PERMISSIONS` jen přes `:read` permission. To znamená:

- `admin` vidí moduly `dashboard`, `housekeeping`, `breakfast`, `lost_found`, `issues`, `inventory`, `reports`, `users`, `settings`
- `pokojská` vidí pouze `housekeeping`
- `údržba` vidí pouze `issues`
- `recepce` vidí `breakfast` a `lost_found`
- `snídaně` vidí pouze `breakfast`
- `sklad` vidí pouze `inventory`

Write-only schopnost bez `:read` permission neopravňuje sama o sobě k zobrazení modulu v navigaci.

## Vynucení na API

Základní guardy:

- `require_permission`
- `require_module_access`
- `require_role`
- `require_actor_type`

Mapování HTTP metod:

- `GET` -> `:read`
- `POST`, `PUT`, `PATCH`, `DELETE` -> `:write`

Chybové odpovědi:

- chybějící permission vrací `403` s `Missing permission: <module>:<action>`
- multi-role `portal` session bez `active_role` vrací `403` s `Active role must be selected`
- neplatná nebo chybějící session vrací `401` s `Authentication required`

## Důležité runtime výjimky nad rámec matice

Samotná module-level permission nestačí na všechny endpointy. Backend má ještě jemnější omezení:

- `breakfast`
  - plánování, mazání, import/export a reaktivace jsou jen pro `admin` nebo `recepce`
  - role `snídaně` smí zapisovat jen omezeně, typicky označit objednávku jako `served`
- `inventory`
  - role `sklad` má modulový přístup k seznamům a pohybům skladu
  - create/update/delete položek, detail položky, mazání pohybů, práce s kartami a export inventury jsou omezené na `admin`
- `issues`
  - `pokojská` může zakládat závady a nahrávat fotky
  - `údržba` může měnit jen stav a jen povoleným směrem
  - mazání je jen pro `admin`
- `users` a `settings`
  - přístup je vázaný na actor type `admin`, nestačí pouze role z portálu

Při změně RBAC proto nestačí upravit jen permission matici. Je nutné zkontrolovat i route-level guardy.

## Životní cyklus session

RBAC stojí nad tabulkou `auth_sessions`.

- login vytváří server-side session
- logout ruší aktuální session
- změna rolí, deaktivace uživatele, změna emailu, změna hesla i reset hesla ruší aktivní session uživatele
- validace session zároveň kontroluje, že uživatel stále existuje, je aktivní a u `admin` session má dál roli `admin`

## Audit identita

Audit pracuje s normalizovanou identitou:

- `actor_id`: email ze session
- `actor_role`: `active_role`, případně základní role session
- `actor_type`: `admin` nebo `portal`

Pro legacy exporty se české role převádějí na anglické štítky:

- `pokojská` -> `housekeeping`
- `údržba` -> `maintenance`
- `recepce` -> `reception`
- `snídaně` -> `breakfast`
- `sklad` -> `warehouse`

## Chování frontendů

Oba frontendy používají stejný vysokourovňový auth stav:

- `authenticated`
- `unauthenticated`
- `error`

Pravidla:

- `401` a `403` z `/api/auth/me` se mapují na `unauthenticated`
- ostatní chyby se ukazují jako explicitní auth error
- chráněné route přesměrovávají na login místo lokálního fake přístupu

## QA-only utility stavy

CI a Playwright stále ověřují utility stavy `loading`, `empty`, `error`, `offline`, `maintenance` a `404`.

Tyto vynucené stavy nejsou součástí běžného produkčního RBAC runtime. Jsou dostupné jen v QA buildu se zapnutým testovacím flagem.
