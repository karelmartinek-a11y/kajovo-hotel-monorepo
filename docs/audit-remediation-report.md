# Audit Remediation Report

## Branding, design a lokalizace

### Co audit tvrdil
- Chybí centrální tokeny a manifest není promítnutý do runtime stylů.
- HTML shell nehlídá `lang`, `charset` a `viewport`.
- Login obrazovky nejsou v češtině a nejsou napojené na i18n vrstvu.
- Navigace nepracuje s lokalizovanými popisky.

### Co bylo v repu skutečně nalezeno
- `packages/ui/src/tokens.css` se rozcházela se zdrojovým manifestem (`apps/kajovo-hotel/ui-tokens/tokens.json`), navíc wordmark tagline dědila nízký kontrast (`#737578` na `#f5f5f5`).
- HTML shell obsahoval `charset` i `viewport`, ale `document.lang` ani `document.title` se v runtime nenastavovaly; titulek byl generický (`KájovoHotel`).
- Login komponenty používaly shared bundly, ale chyběla validace povinných polí a doplnění `document.lang` / `title`.
- Navigace měla fallback skupinu napevno (`Ostatní`) místo využití lokalizovaných labelů.
- Layout (AppShell) renderoval wordmark, figurku i signage současně, čímž překračoval limit `maxBrandElementsPerView = 2` definovaný v brand manifestu.

### Co bylo opraveno
- Sjednoceny z-index tokeny a doplněny aliasy (`defaultGroupLabel`, modal/toast/popover) v `packages/ui/src/tokens.css`, zároveň zvýšen kontrast tagline (`color: var(--k-color-ink)`).
- Vytvořen komponent `packages/ui/src/shell/KajovoWordmark.tsx` s českou titulku, `title` a alt textem.
- HTML shell titulky rozlišeny (`apps/kajovo-hotel-web/index.html`, `apps/kajovo-hotel-admin/index.html`) a portál i administrace nově nastavují `document.lang` a `document.title` podle aktivního jazyka.
- Login stránky (`PortalLoginPage`, `AdminLoginPage`) napojeny na shared i18n bundly, přidána kontrola povinných polí a chyby v češtině/angličtině.
- Navigace používá lokalizovaný fallback (`moduleLabels.other`) díky novému poli `defaultGroupLabel` a úpravám v `ModuleNavigation`.
- `AppShell` dostal parametr `showFigure`; portál i administrace s ním vypínají figurku, takže ve výhledu zůstávají pouze wordmark a signage v souladu s manifestem.

### Co nešlo bezpečně udělat bez dalších podkladů
- V repu není oficiální varianta loga mimo existující asset, proto nedošlo k reexportu.

### Jak to ověřit
- `pnpm --filter @kajovo/ui lint`
- `pnpm --filter @kajovo/kajovo-hotel-web lint`
- `pnpm --filter @kajovo/kajovo-hotel-web test -- --grep ci-gates`
- Ručně načíst `/login` a `/admin/login`, zkontrolovat `document.documentElement.lang`, `document.title` a texty chybových hlášek.
- V DevTools projít `:root` a ověřit sjednocené tokeny (`--k-z-*`, barvy) i to, že `data-brand-element="true"` nepřekročí 2 prvky na route.

## RBAC a navigace

### Co audit tvrdil
- Role-based navigace byla nekompletní a admin postrádal přepínání modulů.
- Frontend ukazoval moduly bez odpovídající role a backend kontrola nebyla sjednocená.

### Co bylo v repu skutečně nalezeno
- Permission/role mapa byla duplikovaná ve dvou frontendech, backend měl vlastní definici v `app/security/rbac.py`.
- Portál i admin UI filtrovaly moduly, ale mapy role → modul byly natvrdo rozkopírované na více místech.
- Admin module switcher existoval, ale opíral se o lokální konstanty a nepoužíval lokalizované popisky.
- Endpointy správy SMTP kontrolovaly `users` permissions místo `settings` a chyby actor type byly generické.

### Co bylo opraveno
- Přidán sdílený modul `packages/shared/src/rbac.ts` s jednotnou mapou rolí, oprávnění a modulů; oba frontend helpery (`apps/kajovo-hotel-web/src/rbac.ts`, `apps/kajovo-hotel-admin/src/rbac.ts`) jej nyní používají.
- Portál i admin navigace (`PortalRoutes`, `admin/AdminRoutes.tsx`) nově filtrují moduly podle skutečných oprávnění, využívají lokalizované názvy/sekce z `getAuthBundle` a konzumují `ROLE_MODULES` jako jediný zdroj pravdy.
- Admin module switcher používá lokalizované popisky, má test-ID a Playwright scénáře (desktop/tablet/phone) v `rbac-access.spec.ts`.
- Backend `settings` router přepnut na `module_access_dependency("settings")`; RBAC deny matrix rozšířen o kontroly actor type.
- Přidány Playwright testy pro portál (recepce bez `breakfast:read`) i admin module switcher a sjednocené RBAC scénáře (`pnpm --filter @kajovo/kajovo-hotel-web test -- tests/rbac-access.spec.ts`).

### Co nešlo bezpečně udělat bez dalších podkladů
- Neexistuje žádný non-admin actor typu `admin`; chování pro chybějící `settings:*` permission zůstává na úrovni actor type guardu.

### Jak to ověřit
- `pnpm --filter @kajovo/kajovo-hotel-web lint`
- `pnpm --filter @kajovo/kajovo-hotel-admin lint`
- `pnpm --filter @kajovo/kajovo-hotel-web test -- tests/rbac-access.spec.ts`
- `pnpm --filter @kajovo/kajovo-hotel-admin test -- --grep "rbac"`
- `python -m pytest apps/kajovo-hotel-api/tests/test_rbac_admin_matrix.py`

## Admin > Uživatelé

### Co audit tvrdil
- V administraci funguje výpis a vytvoření uživatele, ale chybí nebo nefunguje smazání.
- Smazání nemá potvrzovací dialog a není zajištěná ochrana oprávnění / audit trail.

### Co bylo v repu skutečně nalezeno
- Frontend `UsersAdmin` volal create/update/active/password endpointy bez CSRF hlavičky; reálná komunikace by končila `403`.
- Smazání používalo `window.confirm`, nemělo konzistentní CSRF ani mapování chybových stavů (403/404/409).
- UI vracelo generické hlášky bez rozlišení konfliktu e-mailu nebo oprávnění.
- Backend `DELETE /api/v1/users/{id}` provedl tvrdé smazání, ale dovolil odstranit i účet s e-mailem hlavního admina a do audit trailu nepřidával popis akce.
- Testy pokrývaly CRUD, ale chyběl pozitivní případ delete, guard na admin účet a ověření CSRF na frontendu.

### Co bylo opraveno
- Vytvořen `HttpError` helper a `normalizeHeaders` ve `fetchJson`; všechny uživatelské POST/PATCH/DELETE volají API s jednotnou CSRF hlavičkou a detailní chybovou zprávou.
- `UsersAdmin` přidal stav `pendingDelete` a renderuje přístupný potvrzovací blok s detailní hláškou místo `window.confirm`.
- Chybová hlášení pro create/update/active/delete rozlišují 403, 404, 409 i validační chyby; potvrzovací dialog resetuje formulář a po smazání refreshuje seznam.
- Backend `delete_user` nyní blokuje odstranění hlavního admin účtu, zapisuje audit detail (`user_id`, `email`) a pokračuje v hard delete (v DB není podpora soft delete).
- Rozšířen `apps/kajovo-hotel-api/tests/test_users.py` o nové scénáře: admin delete, blokace admin účtu.
- Doplněny Playwright testy (`tests/users-admin.spec.ts`) pro CSRF při create a kompletní delete flow včetně potvrzovacího dialogu na všech breakpointech.

### Co nešlo bezpečně udělat bez dalších podkladů
- Schéma neobsahuje `deleted_at` ani audit trail pro obnovu, proto zůstává hard delete; bez doménového rozhodnutí nebylo zaváděno soft delete ani ochrana proti smazání „posledního“ uživatele role.

### Jak to ověřit
- `python -m pytest apps/kajovo-hotel-api/tests/test_users.py`
- `pnpm --filter @kajovo/kajovo-hotel-admin lint`
- `pnpm --filter @kajovo/kajovo-hotel-admin exec playwright test tests/users-admin.spec.ts`

## Přístupnost (WCAG 2.1 / 2.2)

### Co audit tvrdil
- Chybí konzistentní keyboard path (skip link), preferovaný brand limit překročila hlavička, některé hlášky nejsou čteny screen readery a potvrzovací dialog při mazání není přístupný.

### Co bylo v repu skutečně nalezeno
- `AppShell` neměl „Přeskočit na obsah“ a figurka + signace + wordmark překračovaly limity na všech breakpointech; texty používaly porušené kódování (`KĂˇja`, `KĂJOVO`).
- `ModuleNavigation` neřešila fokus z draweru, nešlo jej zavřít klávesou Escape a fallback štítky byly bez diakritiky.
- `StateView` renderoval pouze statické `<section>` bez `aria-live`, takže chybové/infomessages ve správě uživatelů a loginu se nehlásily.
- Potvrzení mazání uživatele používalo běžnou kartu bez role, bez návratu fokusu a bez ESC.

### Co bylo opraveno
- `packages/ui/src/shell/AppShell.tsx`: přidán skip link, auto-id `main-content`, opravené texty a zachování max. dvou brand prvků.
- `packages/ui/src/tokens.css`: přidané styly pro skip link, aby byl na focus viditelný.
- `packages/ui/src/navigation/ModuleNavigation.tsx`: doplněno `aria-modal`, řízení fokusu, ESC na zavření, opravené fallback texty (`Ostatní`, `Žádné výsledky.`) a zachované `aria-label` v češtině.
- `packages/ui/src/components/StateView.tsx`: nově používá `aria-live` (`error` → `assertive`, ostatní `polite`) a `aria-atomic`.
- `apps/kajovo-hotel-admin/src/main.tsx` (UsersAdmin): potvrzovací dialog má `role="alertdialog"`, automaticky zaměřuje primární tlačítko, vrací fokus na spouštěcí tlačítko a reaguje na Escape; chybová/infomessage používají `stateKey="error/info"` pro správné oznamování.
- `packages/ui/src/shell/KajovoSign.tsx`: opravené aria labely/alt v UTF-8.

### Co nešlo bezpečně udělat bez dalších podkladů
- Nebyl zaveden plný focus-trap v draweru navigace; vyžadovalo by refaktor layoutu a konzultaci s designem.

### Jak to ověřit
- `pnpm --filter @kajovo/ui lint`
- `pnpm --filter @kajovo/kajovo-hotel-admin lint`
- `pnpm --filter @kajovo/kajovo-hotel-admin exec playwright test tests/users-admin.spec.ts`
- Ručně: tabulátorem aktivovat skip link (na `/admin/`), otevřít mobilní navigaci (DevTools viewport ≤ 767 px) a ověřit zavření přes Escape; otevřít dialog smazání a ověřit fokus i ESC.

## Bezpečnost (cookies, CORS, CSP, hlavičky)

### Co audit tvrdil
- API nevynucuje bezpečné hlavičky, chybí CSP, Trusted-Host kontrola a není jasné, jaké originy mohou přistupovat k API. Nutné je také potvrdit správné CSRF a cookie nastavení.

### Co bylo v repu skutečně nalezeno
- FastAPI instance používala pouze vlastní CSRF middleware; nebyly přidány bezpečnostní hlavičky, žádná kontrola hostitelů ani CORS konfigurace.
- Cookies už měly `HttpOnly`/`SameSite=Lax`/`Secure` (v produkci) – to jsme zachovali.

### Co bylo opraveno
- `app/config.py`: přidané nové nastavení `trusted_hosts`, `cors_allow_origins` a `content_security_policy` s bezpečným výchozím CSP (blokuje cizí skripty, iframe, omezí form-action).
- `app/main.py`: nasazený `TrustedHostMiddleware` (výchozí: `kajovohotel.local`, `localhost`, `127.0.0.1`), volitelný CORS middleware (pouze pokud nastavíme explicitní originy) a sjednocený middleware, který kromě CSRF zapisuje hlavičky `Content-Security-Policy`, `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy` a `Strict-Transport-Security` (jen v produkci).
- `tests/test_security_headers.py`: nový regresní test ověřující přítomnost bezpečnostních hlaviček na `/health`.

### Co nešlo bezpečně udělat bez dalších podkladů
- Produkční seznam hostů a případné externí originy nejsou známé; zatím je podporován pouze whitelist definovaný přes ENV.
- Neprováděli jsme automatizovaný dependency audit – nutný input na preferovaný nástroj (např. `pip-audit` v CI).

### Jak to ověřit
- `python -m pytest apps/kajovo-hotel-api/tests/test_security_headers.py`
- `python -m pytest apps/kajovo-hotel-api/tests`
- Zkontrolovat běžící instanci: `curl -I http://localhost:8000/health` => hlavičky `Content-Security-Policy`, `Referrer-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`.

## CI/CD

### Co audit tvrdil
- Chybí jistota, že lint/unit/e2e běží v CI; požadavek na gating (brand, WCAG) a jasný staging/prod postup.

### Co bylo v repu skutečně nalezeno
- Dva hlavní GitHub Actions workflow: `ci-full.yml` (api pytest, web Playwright, e2e smokes, lint/contract) a `ci-gates.yml` (tokens, brand, signage, view-states, WCAG, typecheck, unit, smoke). Oba se spouští na PR i push.
- Produkční deploy (`deploy-production.yml`) se spouští ručně nebo po úspěšném CI na branch `main`; běží přes SSH a skript `infra/ops/deploy-production.sh`, který rebuilduje kontejnery a čistě inicializuje Postgres volume.
- `pnpm` skripty v `package.json` slučují lint (`pnpm lint`), unit (`pnpm unit`), smoke (`pnpm ci:e2e-smoke`, `pnpm ci:signage`), policy gate atd. Playwright instalace běží automaticky v pretest.
- Staging prostředí explicitně definované není; deploy script cílí přímo na produkční docker compose.

### Co bylo opraveno
- V této iteraci nebylo nutné zasahovat do CI pipeline; existující workflow pokrývá auditované body (lint, unit, smoke, WCAG).
- Doplnili jsme audit report o přehled pipeline a přidali bezpečnostní hlavičky/Trusted Host, které budou odteď také procházet přes CI test `test_security_headers.py`.

### Co nešlo bezpečně udělat bez dalších podkladů
- Definovat staging proces – vyžaduje potvrzení infrastruktury (další compose file, DNS).
- Přesnější seznam CORS/trusted hostů: je třeba získat produkční domény.

### Jak to ověřit
- `gh workflow run ci-full.yml` (nebo push/PR) ⇒ očekává se běh jobs `api-tests`, `web-tests`, `e2e-smoke`, `lint-and-contract`, `e2e-auth-smoke`.
- `gh workflow run ci-gates.yml` ⇒ pipeline musí projít bez manuálních zásahů (tokens, brand, signage, view-states, WCAG, typecheck, unit).
- `gh workflow run deploy-production.yml --ref main` (s vyplněnými secrets) ⇒ kontroluje úspěšný výstup deploy scriptu.
