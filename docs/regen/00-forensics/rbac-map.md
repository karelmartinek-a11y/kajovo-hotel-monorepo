# RBAC mapa (legacy → parity)

## 1) Legacy role vrstvy

### A) Web admin session
- Jediný admin účet (`admin_singleton`) + session cookie.
- Gating: všechny `/admin/**` obrazovky a akce vyžadují autentizovaný admin session kontext.

### B) Portal user role
- Role: `housekeeping`, `frontdesk`, `maintenance`, `breakfast`.
- Použití: přístup do `/portal` a role-labeled provozní práce; reset hesla přes e-mail flow.

### C) Device role gating
- Device role set je uložen v zařízení (`roles`).
- Reports API omezuje typ reportu podle role zařízení (např. housekeeping/frontdesk vs maintenance domény).
- Neaktivní/revoked zařízení nemá přístup k workflow akcím.

## 2) Role → permissions → moduly (paritní výklad)

| Role | Permission cluster | Moduly |
|---|---|---|
| admin | full read/write | dashboard, users, settings, reports, breakfast, inventory, media |
| portal:frontdesk | report/create + breakfast ops | portal, breakfast, report provoz |
| portal:housekeeping | report/create + room evidence | portal, report provoz |
| portal:maintenance | issue workflow | portal, závady/issue doména |
| portal:breakfast | breakfast check/note | portal, snídaně |
| device:provisioned-active | ingest + polling dle role scope | reports/media, provisioning navazující akce |

## 3) Gating pravidla
- `admin/*` route bez session → redirect na `/admin/login`.
- Portal route bez user session → 401/redirect na `/login`.
- Device API bez validního tokenu/challenge → 401/403.
- Device status `REVOKED` nebo `PENDING` → 409/403 dle endpointu.

## 4) Požadavek parity pro nový systém
- Definovat explicitní permission matrix pro web i API v jednom SSOT souboru.
- Zachovat oddělení „admin session“, „portal user“, „device identity“.
- Každý modul musí mít minimálně `read`/`write` capability map + testy na direct URL access denied.
