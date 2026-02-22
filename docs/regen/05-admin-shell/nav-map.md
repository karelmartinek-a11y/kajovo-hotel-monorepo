# 05 Admin shell — Nav map

## Scope
Mapování panel design podkladů (`brand/panel/*`) na konkrétní Admin app route/view (`apps/kajovo-hotel-admin/src/main.tsx`).

## Panel -> admin route/view

| Panel design asset | Design intent | Admin route/view map | Stav |
| --- | --- | --- | --- |
| `brand/panel/login_admin.png` | Samostatný admin login panel | `/login` -> `AdminLoginPage` | DONE |
| `brand/panel/login_admin_fail.png` | Fail stav admin loginu | `/login` -> `AdminLoginPage` (error feedback při nevalidním loginu) | DONE |
| `brand/panel/menu_admin.png` | Admin hlavní menu | `AppShell` + route set `Dashboard`, `Breakfast*`, `LostFound*`, `Issues*`, `Inventory*`, `Reports*`, `UsersAdmin` | DONE |
| `brand/panel/menu_recepční.png` + `menu_recepce_snídaně.png` + `menu_recepce_nálezy.png` | Recepční provozní navigace | `/snidane*`, `/ztraty-a-nalezy*`, `/hlaseni*` | DONE |
| `brand/panel/menu_pokojska.png` + `menu_pokojská_snídaně.png` + `menu_pokojská_sklad.png` + `menu_pokojská_hlášení.png` | Pokojská provozní navigace | `/snidane*`, `/sklad*`, `/hlaseni*` | DONE |
| `brand/panel/menu_údržba.png` | Údržba/technické závady | `/zavady*` | DONE |
| `brand/panel/login_user.png` + `login_user_fail.png` + `login_user_password_reset.png` | Portal login flow (mimo admin shell) | Není součást admin entrypointu; mapováno v Portal app (`apps/kajovo-hotel-web/src/main.tsx`) | OUT_OF_SCOPE |

## Poznámky
- Admin shell používá vlastní entrypoint (`apps/kajovo-hotel-admin/src/main.tsx`) a vlastní login route `/login`.
- RBAC guard (`isAllowed`) je aplikovaný na každou admin module route; při deny se renderuje `AccessDeniedPage`.
