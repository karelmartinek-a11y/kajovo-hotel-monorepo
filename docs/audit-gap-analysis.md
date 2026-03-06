# Audit gap analysis

Každý auditní bod v tabulce níže je popsán přesně podle požadované struktury. Tam, kde něco stále není hotové nebo závisí na prostředí, je to explicitně označeno jako blokér.

## 1. Design manifest / brand tokens / logo / meta
- **Co audit tvrdil:** Panel musí používat oficiální brand tokeny, správnou jazykovou značku, viewport a assety z manifestu.
- **Co bylo skutečně nalezeno v repu:** `apps/kajovo-hotel-web/index.html` i `apps/kajovo-hotel-admin/index.html` odkazují na `brand/...` assety, načítají fonty/tokeny z `packages/ui/src/tokens.css` a aplikují `<meta charset="utf-8">`, `<meta name="viewport">` a atribut `lang`.
- **Stav:** HOTOVO
- **Důkaz v kódu:** `apps/kajovo-hotel-web/src/index.html`, `apps/kajovo-hotel-admin/src/main.tsx`, `packages/ui/src/tokens.css`
- **Co chybělo / bylo nedotažené:** nic.
- **Jaká oprava byla provedena:** žádná cílená změna; auditovaný stav potvrzený.
- **Jak to ověřit:** manuální kontrola HTML hlaviček + stylování v aplikacích.
- **Zbývající rizika / blokery:** žádné.

## 2. Login frontend + admin
- **Co audit tvrdil:** Přihlášení musí být stabilní, lokalizované a respektovat RBAC (vracení 401/403 pokud není přihlášen).
- **Co bylo skutečně nalezeno v repu:** obě aplikace (`apps/kajovo-hotel-web/src/login.css`, `apps/kajovo-hotel-admin/src/main.tsx` a routery) používají `getAuthBundle`, přesměrovávají při již přihlášeném adminovi a volají `/api/auth/login`, `/api/auth/admin/login`. Chyby (401/403) se překládají do UI zpráv.
- **Stav:** HOTOVO
- **Důkaz v kódu:** `apps/kajovo-hotel-web/src/main.tsx` (login flow), `apps/kajovo-hotel-admin/src/main.tsx` (admin redirekce), `apps/kajovo-hotel-api/app/api/routes/auth.py`.
- **Co chybělo / bylo nedotažené:** nic.
- **Jaká oprava byla provedena:** žádná.
- **Jak to ověřit:** ruční přihlášení, kontrola konzole a response.
- **Zbývající rizika / blokery:** žádné.

## 3. Čeština / UTF-8 / i18n
- **Co audit tvrdil:** Veškerý text musí být v češtině a soubory uložené v UTF-8.
- **Co bylo skutečně nalezeno v repu:** UI stringy v češtině, lokalizační `ia.json`, všechny zdrojové soubory v UTF-8. Navíc `login.css` a další komponenty používají správné znaky.
- **Stav:** HOTOVO
- **Důkaz v kódu:** `apps/kajovo-hotel-web/src/main.tsx` (české zprávy), `apps/kajovo-hotel-admin/src/main.tsx`, `kaijovo-hotel/ux/ia.json`.
- **Co chybělo / bylo nedotažené:** nic.
- **Jaká oprava byla provedena:** potvrzení stavu.
- **Jak to ověřit:** vizuální kontrola UI a souborů.
- **Zbývající rizika / blokery:** žádné.

## 4. RBAC & role-based navigace
- **Co audit tvrdil:** Frontend by měl filtrovat menu podle rolí a backend by měl prodělat 401/403 pro citlivé moduly.
- **Co bylo skutečně nalezeno v repu:** `packages/shared/src/rbac.ts`, `apps/kajovo-hotel-web/src/portal/PortalRoutes.tsx` i `apps/kajovo-hotel-admin/src/main.tsx` skrývají moduly podle rolí; backend `MODULE_ACCESS` a `require_actor_type` zajišťují 403. Nově jsme do `apps/kajovo-hotel-api/app/api/routes/users.py` přidali detailní ochranu a testy (viz níže).
- **Stav:** ČÁSTEČNĚ HOTOVO
- **Důkaz v kódu:** `apps/kajovo-hotel-api/app/api/routes/users.py`, `apps/kajovo-hotel-api/app/security/rbac.py`, `apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx`, `apps/kajovo-hotel-web/tests/rbac-access.spec.ts`, `apps/kajovo-hotel-api/tests/test_users.py`.
- **Co chybělo / bylo nedotažené:** předchozí chybějící server-side omezení pro mazání uživatele (self-deletion, poslední admin).
- **Jaká oprava byla provedena:** backend nyní ověřuje, zda cíl není `admin_email`, zda jde o aktuálního uživatele a zda neodstraňujeme posledního aktivního admina; frontend zobrazí relevantní chybové zprávy. Přidány integrační testy.
- **Jak to ověřit:** `python -m pytest apps/kajovo-hotel-api/tests/test_users.py` (obsahuje nový test), ruční pokus o smazání, vizualizace chyby.
- **Zbývající rizika / blokery:** žádné.

## 5. Admin module switcher
- **Co audit tvrdil:** Admin musí mít přehled modulů a přepínání mezi nimi.
- **Co bylo skutečně nalezeno v repu:** `AdminRoutes` sestavují `modulesForShell` z IA a doplňují `users` modul; `AppShell` zobrazuje `module` menu. Playwright test `rbac-access` to ověřuje.
- **Stav:** HOTOVO
- **Důkaz v kódu:** `apps/kajovo-hotel-web/src/admin/AdminRoutes.tsx`, `packages/ui/src/shell/AppShell.tsx`, `apps/kajovo-hotel-web/tests/rbac-access.spec.ts`.
- **Co chybělo / bylo nedotažené:** nic.
- **Jaká oprava byla provedena:** žádná.
- **Jak to ověřit:** Playwright test `rbac-access` (zahrnutý v `pnpm test` a `ci:gates`).
- **Zbývající rizika / blokery:** žádné.

## 6. Admin > Uživatelé (list/create/update/delete/filter)
- **Co audit tvrdil:** Admin panel uživatelů potřebuje funkční výpis, filtraci, vytvoření a smazání s potvrzením.
- **Co bylo skutečně nalezeno v repu:** `UsersAdmin` nabízí seznam, filtr, formuláře a potvrzovací dialog; backend CRUD je přístupný přes `/api/v1/users`; `cnnections` handle 401/403/409. Zrušené requesty vrací srozumitelný text, testy pokrývají CRUD plus nové last-admin testy.
- **Stav:** HOTOVO
- **Důkaz v kódu:** `apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx`, `apps/kajovo-hotel-api/app/api/routes/users.py`, `apps/kajovo-hotel-api/tests/test_users.py`.
- **Co chybělo / bylo nedotažené:** chyběl server-side guard pro self-delete/last admin; front-end nezobrazoval specifické zprávy.
- **Jaká oprava byla provedena:** viz bod 4; front-end chytře zpracovává detail (`'own account'` vs `'last admin'`), backend blokuje nemožné akce.
- **Jak to ověřit:** spuštěný test `python -m pytest ... test_users.py` + ruční smazání (včetně posledního admina).
- **Zbývající rizika / blokery:** žádné.

## 7. WCAG 2.1 AA
- **Co audit tvrdil:** Oprava focus/ARIA/kontrastu na loginu a adminu.
- **Co bylo skutečně nalezeno v repu:** `@axe-core/playwright` testy existují (`apps/kajovo-hotel-web/tests/accessibility.spec.ts` a další) a aplikace používá labely, role, `aria-live`, focus management; front-end přidává dialogy se správnou navigací. Tablet/phone `ci-gates` testy ale stále narážejí na složité routy poté, co Vite proxy nemůže kontaktovat backend (viz `pnpm test` log).
- **Stav:** ČÁSTEČNĚ HOTOVO
- **Důkaz v kódu:** `apps/kajovo-hotel-web/src/admin/UsersAdmin.tsx` (aria-label, dialog), `apps/kajovo-hotel-web/tests/accessibility.spec.ts`, Playwright `ci-gates` logs.
- **Co chybělo / bylo nedotažené:** full run `accessibility.spec.ts` jen na desktopu; tablet/phone varianty v `ci-gates` se nedaří kvůli nedostupnému backendu (proxy `127.0.0.1:8000`).
- **Jaká oprava byla provedena:** OPRAVENO focus-handling (delete dialog, `aria-live`), i18n popisky, mention of `aria-describedby`; backend update nepotřebný.
- **Zbývající rizika / blokery:** Playwright tablet/phone WCAG testy se stále neprovádějí automaticky, dokud neexistuje spolehlivá API mock/proxy nebo běžící backend (blokér mimo repo).

## 8. Security (access control, CORS, cookies, CSRF, CSP, dependency hardening)
- **Co audit tvrdil:** Zpevnit auth (RBAC, cookies, CSRF), přidat CSP/headers, pečlivě ošetřit CORS.
- **Co bylo skutečně nalezeno v repu:** `app/security/auth.py` zajišťuje HttpOnly/SameSite/secure cookies, CSRF ověření, CSP/X-Frame-Options přidává `security_middleware`, `settings.cors_allow_origins` se používá v `CORSMiddleware`, `ensure_csrf` funguje pro všechny write requests, `apps/kajovo-hotel-api/tests/test_security_headers.py` pokrývá hlavičky a CORS. `dependencies` se aktualizovaly (pnpm lock) v rámci předchozích commitů.
- **Stav:** HOTOVO
- **Důkaz v kódu:** `apps/kajovo-hotel-api/app/main.py`, `apps/kajovo-hotel-api/app/security/auth.py`, `apps/kajovo-hotel-api/tests/test_security_headers.py`, `.github/workflows/*` (CI). Přidaná dokumentace `docs/audit-remediation-final.md`.
- **Co chybělo / bylo nedotažené:** nic.
- **Jaká oprava byla provedena:** Převedení RBAC/CSRF/CSP implementace do produkčního middleware + testy.
- **Zbývající rizika / blokery:** žádné.

## 9. CI/CD (lint, testy, smoke/e2e, deploy)
- **Co audit tvrdil:** Kompletní CI s lintem, testy, buildem, staging/preview a e2e/smoke.
- **Co bylo skutečně nalezeno v repu:** existují workflows `.github/workflows/ci-core.yml`, `preview.yml`, `release.yml`, `deploy-production.yml` (uptodate). `pnpm lint` a `pnpm test` běží, Playwright testy pokrývají DRY, `ci:gates` kombinuje tokens/brand/... + `pnpm test:smoke`. Současně `pnpm test` selhává u tablet/phone kvůli offline API a `Vite proxy error: ECONNREFUSED 127.0.0.1:8000`.
- **Stav:** ČÁSTEČNĚ HOTOVO
- **Důkaz v kódu:** `.github/workflows/*.yml`, `apps/kajovo-hotel-web/tests/*`, `pnpm test` log, `docs/testing.md`.
- **Co chybělo / bylo nedotažené:** chybí spolehlivé CI nastavení backendu pro Playwright (proxy) a integrace staging/preview s autentizací.
- **Jaká oprava byla provedena:** Opraven srp test (RBAC), doplněna `Users` testovací sada a backend se spouští pro unit testy; `pnpm lint` validace; `pnpm test` stále vyžaduje běžící backend.
- **Zbývající rizika / blokery:** Playwright testy (tablet/phone) nenaběhnou bez dostupného backendu nebo mock serveru; potřeba CI helper mimo repo (blokér mimo repo).

## 10. PDF export/import
- **Co audit tvrdil:** Chyběl PDF export/inport pro snídaně.
- **Co bylo skutečně nalezeno v repu:** Backend parser existoval; přidali jsme `/api/v1/breakfast/export/daily`, UI tlačítko pro export, test `test_breakfast_export_pdf`, dokumentaci v `docs/pdf-export-import.md`.
- **Stav:** HOTOVO
- **Důkaz v kódu:** `apps/kajovo-hotel-api/app/api/routes/breakfast.py`, `apps/kajovo-hotel-admin/src/main.tsx`, `apps/kajovo-hotel-web/src/main.tsx`, `apps/kajovo-hotel-api/tests/test_breakfast.py`.
- **Co chybělo / bylo nedotažené:** implementace exportu a UI triggeru dříve chyběla.
- **Jaká oprava byla provedena:** export přidán + tlačítko; integrace test a dokumentace.
- **Zbývající rizika / blokery:** žádné.
