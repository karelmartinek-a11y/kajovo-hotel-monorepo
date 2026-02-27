# Verification – 03 admin-portal-split

## Cíl
Dokončit oddělení Admin vs Portal UI: separátní routy, separátní login obrazovky a vynucení `panelLayout` na route-tree úrovni.

## Co se změnilo
- Přidány separátní login stránky:
  - `/admin/login` (`src/admin/AdminLoginPage.tsx`) s referencí na `brand/panel/login_admin.png`.
  - `/login` (`src/portal/PortalLoginPage.tsx`) s referencí na `brand/panel/login_user_fail.png`.
- Router rozdělen do 2 stromů:
  - `/admin/*` používá `AppShell panelLayout='admin'`.
  - Ostatní routy používají `AppShell panelLayout='portal'`.
- Přidán datový atribut layoutu do `AppShell` (`data-panel-layout`) pro explicitní evidenci layout módu.
- Přidáno login UI CSS (`src/login.css`) bez použití `legacy/**`.

## Jak ověřeno
1. Typová kontrola:
   - `pnpm -C apps/kajovo-hotel-web lint`
   - Očekávání: `tsc --noEmit` bez chyb.
2. Build aplikace:
   - `pnpm -C apps/kajovo-hotel-web build`
   - Očekávání: úspěšný Vite build + bundling login referenčních obrázků.
3. Kontrola oddělení admin/portal importů:
   - `rg -n "from './portal|from '../portal|from './admin|from '../admin'" apps/kajovo-hotel-web/src/admin apps/kajovo-hotel-web/src/portal`
   - Očekávání: žádný výsledek (žádné cross-importy).
4. Vizuální kontrola login route přes Playwright screenshot:
   - `/admin/login`
   - `/login`

## Rizika / known limits
- Admin tree nyní obsahuje minimální admin home route (`/admin`) jako scaffold; modulové admin stránky budou doplněny v navazujících krocích parity.
