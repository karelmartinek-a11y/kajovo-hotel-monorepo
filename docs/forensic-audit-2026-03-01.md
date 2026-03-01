# Forenzní audit 2026-03-01 (legacy vs kajovo-hotel-monorepo)

## 1) Rozdíly obsahu: legacy `hotel-frontend` + `hotel-backend` vs. monorepo

### Stav po opravách v tomto cyklu

| Oblast | Legacy požadavek | Monorepo stav | Evidence |
|---|---|---|---|
| Admin/User auth lockout + tiché chování | 3 pokusy / 1h, generické chyby, unlock link | **OPRAVENO** | `apps/kajovo-hotel-api/app/api/routes/auth.py` |
| Multi-role login + role switch | role selection před přístupem do modulů | **OPRAVENO** | `apps/kajovo-hotel-api/app/api/routes/auth.py`, `app/security/rbac.py` |
| Admin Users (list/create/edit/reset-link) | CRUD + reset link + validace | **OPRAVENO** | `apps/kajovo-hotel-api/app/api/routes/users.py`, `app/api/schemas.py` |
| E.164 telefon + validace emailu | povinná validace | **OPRAVENO** | `apps/kajovo-hotel-api/app/api/schemas.py` |
| RBAC role set (pokojská/údržba/recepce/snídaně) | bez driftu rolí | **OPRAVENO (kanonická vrstva)** | `apps/kajovo-hotel-api/app/security/rbac.py`, `app/api/schemas.py` |

### Otevřené funkční GAPy

| Oblast | Legacy požadavek | Monorepo stav | Dopad |
|---|---|---|---|
| Snídaně: import PDF + IMAP fetch workflow | ruční PDF import + periodické fetch z mailu | **CHYBÍ** (v API je CRUD, není import/fetch pipeline) | chybí provozní automatizace snídaní |
| Sklad: piktogramy/ikony položek + upload | ikony a jejich správa | **CHYBÍ** | nižší UX a chybí parity s legacy procesem |
| Závady/Ztráty: foto upload + thumbnails | foto dokumentace k záznamům | **CHYBÍ** | chybí klíčová procesní evidence |

## 2) Forenzní kontrola login oddělení (User vs Admin)

### Ověřené body

- Oddělené endpointy a session flow:
  - admin login: `/api/auth/admin/login`
  - user login: `/api/auth/login`
- Admin lockout je maskovaný stejnou odpovědí `401 Invalid credentials`.
- Unlock token flow a throttle pro admin hint jsou implementovány.
- User lockout + forgot-password je implementován.
- Multi-role session vyžaduje `active_role` před přístupem k modulům.

### Evidence

- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/security/rbac.py`
- `apps/kajovo-hotel-api/tests/test_auth_lockout.py`
- `apps/kajovo-hotel-api/tests/test_auth_role_selection.py`

## 3) Forenzní kontrola souladu s ManifestDesignKájovo

### Opravené body

- Login admin už nepoužívá full-page background; brand prvky jsou samostatné (`logo` + samostatný vizuální panel s Kájou).
- V aplikačním shellu je doplněná personifikace Kája po modulech jako samostatný brand prvek.
- Signace zůstává v shellu a je zachována i po změnách.
- Brand assety pro admin i web jsou sjednocené v public cestách (wordmark + postavy), takže login i interní obrazovky renderují logo/Káju bez závislosti na panel PNG.
- Na login obrazovkách (user i admin) je renderovaná i signace jako samostatný brand element.
- User login má doplněný flow „zapomenuté heslo“ volající `/api/auth/forgot-password` s generickou odpovědí.

### Evidence

- `apps/kajovo-hotel-admin/src/main.tsx`
- `packages/ui/src/shell/AppShell.tsx`
- `packages/ui/src/tokens.css`

### Otevřené design GAPy

- Personifikace je nyní řešená samostatnými assety postavy Káji (ne přes full panel obraz), ale není ještě plně diferencovaná po všech sub-flow stavech (create/edit/detail/fail) podle všech panel podkladů.

## 4) Důkazní běhy (aktuální)

- API testy: `cd apps/kajovo-hotel-api && pytest -q` → **27 passed**.
- Web CI testy: `pnpm test` → **34 passed, 2 skipped**.

## 5) Závěr

- Kritické auth + users regressions jsou opravené.
- Login separace, lockout chování a admin/user UI jsou výrazně dorovnané.
- SMTP settings modul v admin UI je implementovaný včetně test e-mailu.
- IMAP/scheduler ingest snídaňových PDF je nyní implementovaný v API službě, ale je podmíněný produkčním IMAP nastavením přes env.
- Pro plnou parity akceptaci zbývá hlavně admin profil (změna hesla) a forenzní ověření IMAP ingestu na produkčních datech.
