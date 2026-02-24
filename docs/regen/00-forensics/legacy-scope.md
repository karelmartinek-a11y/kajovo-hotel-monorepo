# Legacy scope (forenzní odvození)

## 1) Modulový rozsah

### Admin/web provoz
- Dashboard (`/admin`, `/admin/dashboard`).
- Hlášení (nálezy + závady) list/detail/workflow (`/admin/reports*`).
- Snídaně (denní přehled, import, check, poznámky, test importu) (`/admin/breakfast*`).
- Sklad (ingredience, stavy zásob, skladové karty, pohyby, piktogramy) (`/admin/inventory*`).
- Uživatelé portálu (`/admin/users`).
- SMTP + systémová nastavení (`/admin/settings`).
- Profil/změna hesla admina (`/admin/profile`).

### Portal/public
- Landing (`/`).
- Login (`/login`).
- Zapomenuté heslo (`/login/forgot`).
- Reset hesla tokenem (`/login/reset?token=...`).
- Odhlášení (`/logout`).
- Portal home (`/portal`).

### Device/API doména
- Device provisioning handshake (register/status/challenge/verify).
- Reports/media ingest (vytvoření hlášení, fotky, open list, mark done, polling new-since).
- Breakfast API surface existuje, ale je v legacy značně omezený/deaktivovaný pro device flow.

## 2) Obrazovky/routy (odvozený katalog)

### Public + portal
- `GET /`
- `GET /login`
- `POST /login`
- `GET /login/forgot`
- `POST /login/forgot`
- `GET /login/reset`
- `POST /login/reset`
- `POST /logout`
- `GET /portal`

### Admin auth + shell
- `GET /admin`
- `GET /admin/login`
- `POST /admin/login`
- `POST /admin/logout`
- `GET /admin/dashboard`

### Reports/media
- `GET /admin/reports/findings`
- `GET /admin/reports/issues`
- `GET /admin/reports`
- `GET /admin/reports/{report_id}`
- `POST /admin/reports/{report_id}/done`
- `POST /admin/reports/{report_id}/reopen`
- `POST /admin/reports/{report_id}/delete`
- `GET /admin/media/{photo_id}/{kind}`

### Breakfast admin
- `GET /admin/breakfast`
- `GET /admin/breakfast/day`
- `POST /admin/breakfast/check`
- `POST /admin/breakfast/note`
- `POST /admin/breakfast/import`
- `POST /admin/breakfast/save`
- `POST /admin/breakfast/upload`
- `POST /admin/breakfast/test`

### Inventory admin
- `GET /admin/inventory` (alias)
- `GET /admin/inventory/ingredients`
- `GET /admin/inventory/stock`
- `GET /admin/inventory/movements`
- `POST /admin/inventory/ingredient/create`
- `POST /admin/inventory/ingredient/{ingredient_id}/update`
- `POST /admin/inventory/ingredient/{ingredient_id}/delete`
- `POST /admin/inventory/ingredient/{ingredient_id}/pictogram`
- `POST /admin/inventory/cards/create`
- `POST /admin/inventory/cards/{card_id}/update`
- `POST /admin/inventory/cards/{card_id}/delete`
- `GET /admin/inventory/media/{ingredient_id}/{kind}`

### Admin users/settings/profile
- `GET /admin/users`
- `POST /admin/users/create`
- `POST /admin/users/{user_id}/send-reset`
- `GET /admin/settings`
- `POST /admin/settings/smtp`
- `GET /admin/profile`
- `POST /admin/profile/password`

## 3) UX toky (klíčové)

### Login + reset
1. Uživatel otevře `/login`.
2. Po `POST /login` vzniká session a redirect na `/portal`.
3. Pokud nezná heslo: `/login/forgot` → generace reset tokenu + e-mail.
4. `/login/reset?token=...` nastaví nové heslo.

### Device provisioning
1. Předregistrované zařízení volá `POST /device/register`.
2. Stav se ověřuje přes `GET /device/status`.
3. Aktivní zařízení získá challenge (`POST /device/challenge`).
4. Podepsaná challenge se ověří na `POST /device/verify` a vrací device token.

### Reports/media
1. Zařízení po autorizaci zapisuje report (`POST /reports`, volitelně s fotkami).
2. Admin listuje otevřené reporty (`/admin/reports*`) a mění stav done/reopen.
3. Thumbnail/foto jsou dostupné přes media endpointy.
4. Polling endpoint vrací počet nových hlášení od daného času.

### Import snídaní
1. Admin nastaví IMAP konfiguraci.
2. Spustí import (`/admin/breakfast/import`), případně upload PDF (`/upload`) nebo test (`/test`).
3. Data dne jsou v `/admin/breakfast/day`, obsluha potvrzuje checky a poznámky.
4. Běží background scheduler s časovým oknem fetch loop.

### Sklad
1. Správa ingredientů + jednotek + piktogramů.
2. Přes karty IN/OUT se počítá delta zásob.
3. Historie pohybů je rekonstruována z karet a řádků karet.

## 4) Poznámky k rozsahu
- Legacy backend je runtime host i pro „frontend“ šablony (template + static mount).
- Legacy frontend repozitář je primárně zdroj template/static souborů synchronizovaných do backendu skriptem.
