# Brand/panel map (panelové zadání -> route/view)

## Legenda

- **MATCH** = existuje odpovídající route/view.
- **GAP** = route/view chybí; uveden návrh cílového umístění.

## Mapování

1. `brand/panel/login_admin.png` + `brand/panel/login_admin.docx`
   - Cíl v zadání: samostatný **Admin login panel**.
   - Aktuální stav: **GAP** (v `apps/kajovo-hotel-web/src/main.tsx` není `/admin/login`; app používá jednotný SPA entry bez separátní admin login view).
   - Návrh: vytvořit `apps/kajovo-hotel-web/src/admin/AdminLoginPage.tsx` a route `/admin/login` v odděleném admin entry/routeru.

2. `brand/panel/login_user_fail.png`
   - Cíl v zadání: **Portal login fail stav** (chybná autentizace uživatele).
   - Aktuální stav: **GAP** (v aktuálním webu není `/login` ani `/portal/login` view; auth je řešena RBAC hlavičkami, bez separátní portal login stránky).
   - Návrh: vytvořit `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx` + stav `error` a route `/portal/login`.

3. `brand/panel/menu_admin.png`
   - Cíl v zadání: **Admin menu panel**.
   - Aktuální stav: **PARTIAL MATCH** (navigační shell a modulové menu existují v `packages/ui/src/shell/AppShell.tsx` a používají se v `apps/kajovo-hotel-web/src/main.tsx`, ale nejsou oddělené od Portal view).
   - Návrh: rozdělit admin a portal navigaci do separátních entry (`src/admin/*` vs `src/portal/*`) bez sdílení page/view komponent.

4. `brand/panel/menu_pokojska.png` + `brand/panel/menu_pokojska.docx`
   - Cíl v zadání: **Portal menu pro pokojskou**.
   - Aktuální stav: **GAP** (není separátní portal app ani portal menu; pouze jednotná modulová navigace).
   - Návrh: `apps/kajovo-hotel-web/src/portal/PortalShell.tsx` + role-based portal routes (`/portal/*`) odlišné od admin routingu.

5. `brand/panel/menu_pokojská_hlášení.png`
   - Cíl v zadání: **Portal view pro hlášení pokojské**.
   - Aktuální stav: **PARTIAL MATCH** (existuje route `/hlaseni` a view `ReportsList`, ale není v odděleném Portal panelu).
   - Návrh: vytvořit portal-specific route `/portal/hlaseni` s portal view komponentou (ne sdílenou s admin page komponentou).

## Shrnutí GAPů

- Chybí samostatné login routy/view pro Admin i Portal.
- Chybí separátní app-entry/router pro Admin vs Portal.
- Chybí explicitní portal-specific menu/view mapa dle panel podkladů (`menu_pokojska*`, `login_user_fail`).
