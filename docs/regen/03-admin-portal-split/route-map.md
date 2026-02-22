# 03 Admin/Portal split – route map

## Route trees

### Admin tree (`/admin/*`)
- `/admin/login` → samostatná admin login obrazovka (`src/admin/AdminLoginPage.tsx`).
- `/admin` → admin shell (`panelLayout='admin'`) + admin home (`src/admin/AdminHomePage.tsx`).
- `/admin/*` fallback → redirect na `/admin`.

### Portal tree (vše mimo `/admin/*`)
- `/login` → samostatná portal login obrazovka (`src/portal/PortalLoginPage.tsx`).
- `/*` → portal shell (`panelLayout='portal'`) + stávající modulové routy:
  - `/`, `/snidane*`, `/ztraty-a-nalezy*`, `/zavady*`, `/sklad*`, `/hlaseni*`, utility routy (`/intro`, `/offline`, `/maintenance`, `/404`).

## Import boundaries
- Admin views/components jsou umístěné jen v `src/admin/**`.
- Portal views/components jsou umístěné jen v `src/portal/**`.
- Žádné cross-importy `src/admin/**` ↔ `src/portal/**` nebyly zavedeny.
