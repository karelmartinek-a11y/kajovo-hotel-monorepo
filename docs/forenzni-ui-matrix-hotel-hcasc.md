# Forenzni UI matrix pro `hotel.hcasc.cz`

Aktualizovano: `2026-06-12`

Tento dokument je pracovnim SSOT pro revizi weboveho UI `hotel.hcasc.cz` a `hotel.hcasc.cz/admin`.
Zdroje pravdy v tomto zapisu:

- live produkce pres browser audit
- routing a IA v repozitari
- Playwright smoke a visual testy
- aktualni React view komponenty

## Live potvrzene produkcni plochy

### Verejne

- `https://hotel.hcasc.cz/login`
  - login formular portalu
  - sekce pro stazeni Android APK
  - text o resetu hesla pres spravce
- `https://hotel.hcasc.cz/admin/login`
  - admin login formular
  - hint / forgot-password akce

### Live po admin loginu

- `https://hotel.hcasc.cz/admin/`
  - hlavni navigace
  - prehled
  - moduly `Snidane`, `Ztraty a nalezy`, `Zavady`, `Skladove hospodarstvi`, `Profil`, `Uzivatele`, `Nastaveni`

### Produkcni rozpor

- Portalovy ucet `karel.martinek@post.cz` s heslem pouzitym v tomto behu vratil na `https://hotel.hcasc.cz/login` chybu `Neplatne uzivatelske jmeno nebo heslo.`
- Admin ucet `provoz@hotelchodovasc.cz` se stejnym heslem fungoval.

## Portal UI checklist

### Verejne vstupy

- `portal-login-page`
- `portal-reset-password-page`
- APK download CTA
- utility stavy pres routy:
  - `/intro`
  - `/offline`
  - `/maintenance`
  - `/404`

Poznamka: na produkci dnes utility routy bez session vraceji zpet na login.

### Portal po prihlaseni podle routingu a testu

- `reception-hub-page`
- `breakfast-list-page`
- `breakfast-create-page`
- `breakfast-detail-page`
- `breakfast-edit-page`
- `housekeeping-form-page`
- `lost-found-list-page`
- `lost-found-create-page`
- `lost-found-detail-page`
- `lost-found-edit-page`
- `issues-list-page`
- `issues-create-page`
- `issues-detail-page`
- `issues-edit-page`
- `inventory-list-page`
- `inventory-create-page`
- `inventory-detail-page`
- `inventory-edit-page`
- `reports-list-page`
- `reports-create-page`
- `reports-detail-page`
- `reports-edit-page`
- `portal-profile-page`
- `role-select-page`
- `access-denied-page`

### Portal interakce, ktere musi zustat zachovane

- login / logout
- role switch
- reset hesla
- breakfast import a manual refresh modal
- breakfast create / edit / detail
- pokojska quick capture vcetne fotek
- lost-found create / edit / detail
- issue create / edit / detail
- inventory create / edit / detail
- inventory movement flow
- reports create / edit / detail
- timeline zobrazeni
- utility, empty, offline, maintenance a error stavy

## Admin UI checklist

### Verejne vstupy

- `admin-login-page`
- hint flow
- retired / landing admin vstup pres web portal
- utility stavy:
  - `/admin/offline`
  - `/admin/maintenance`
  - `/admin/404`

### Admin po prihlaseni podle testu, routingu a live nav

- `dashboard-page`
- `breakfast-list-page`
- `breakfast-create-page`
- `breakfast-detail-page`
- `breakfast-edit-page`
- `housekeeping-admin-page`
- `lost-found-list-page`
- `lost-found-create-page`
- `lost-found-detail-page`
- `lost-found-edit-page`
- `issues-list-page`
- `issues-create-page`
- `issues-detail-page`
- `issues-edit-page`
- `inventory-list-page`
- `inventory-create-page`
- `inventory-detail-page`
- `inventory-edit-page`
- `inventory-workbench-page`
- `reports-list-page`
- `reports-create-page`
- `reports-detail-page`
- `reports-edit-page`
- `users-admin-page`
- `settings-admin-page`
- `admin-profile-page`
- `access-denied-page`

### Admin interakce, ktere musi zustat zachovane

- admin login
- admin hint / forgot-password flow
- users CRUD
- users invite / hint mail dialog
- profile self-service
- settings a SMTP health
- inventory workbench
- operacni prehled dashboardu
- utility, empty, offline, maintenance a error stavy

## Vazba UI na backend

Redesign nesmi:

- pridat ovladaci prvek bez realneho backend napojeni
- schovat existujici backend capability bez UI vstupu
- rozbit RBAC mapovani mezi roli, modulem a routou
- rozbit generated client nebo prime `fetch` toky pouzite v obou SPA

## Redesign rozhodnuti zamcena pro tuto vlnu

- zachovat existujici logo
- pouzit pouze pismo `Montserrat`
- pridat vice piktogramu v navigaci, stavech a kartach
- drzet svetly hospitality-operational smer
- akcenty stavet na `Kajovo` cervene, teplych neutralnich plochach a prehledne hustote dat

## Poznamka k produkcnimu nasazeni

- produkce nepouziva `Sites`
- povoleny deploy tok je pres:
  - `.github/workflows/ci-gates.yml`
  - `.github/workflows/deploy-production.yml`
- webova runtime zmena musi mit navazany Android parity workstream kvuli `pnpm ci:policy` a `pnpm ci:policy-test`
