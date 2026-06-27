# AUDIT_VERIFICATION_EVIDENCE

## Prostředí
- Repozitář: `/Users/karelmartinek/Documents/GitHub/kajovo-hotel-monorepo`
- Package manager: `pnpm` (`corepack pnpm@9.15.0` pro čistou reinstalaci po rozbitých symlinkách ze zip převodu)
- Python runtime: `.venv311`
- Produkční server potvrzený DNS + SSH: `89.221.222.92`
- Nasazený commit v runtime artefaktu: `c945875`

## Lokální validace 2026-06-28

| Oblast | Příkaz / postup | Výsledek | Důkaz |
|---|---|---|---|
| Install recovery | `corepack pnpm@9.15.0 install` po smazání rozbitých `node_modules` symlinků | PROŠLO | `audit-evidence/command-logs/pnpm-install-corepack9-rerun-20260628.log` |
| UI lint | `corepack pnpm@9.15.0 --dir packages/ui lint` | PROŠLO | `audit-evidence/command-logs/pnpm-lint-ui-rerun-20260628.log` |
| Web lint | `corepack pnpm@9.15.0 --dir apps/kajovo-hotel-web lint` | PROŠLO | `audit-evidence/command-logs/pnpm-lint-web-rerun-20260628.log` |
| Admin lint | `corepack pnpm@9.15.0 --dir apps/kajovo-hotel-admin lint` | PROŠLO | `audit-evidence/command-logs/pnpm-lint-admin-rerun-20260628.log` |
| Web build | `corepack pnpm@9.15.0 --dir apps/kajovo-hotel-web build` | PROŠLO | `audit-evidence/command-logs/pnpm-build-web-rerun-20260628.log` |
| Admin build | `corepack pnpm@9.15.0 --dir apps/kajovo-hotel-admin build` | PROŠLO | `audit-evidence/command-logs/pnpm-build-admin-rerun-20260628.log` |
| Python deps | `python3.11 -m venv .venv311 && pip install -e apps/kajovo-hotel-api` | PROŠLO | lokální shell log, `.venv311` |
| Backend testy | `PATH=\"$PWD/.venv311/bin:$PATH\" python3 -m pytest apps/kajovo-hotel-api/tests -q` | PROŠLO (`118 passed`) | `audit-evidence/command-logs/pytest-api-all-rerun-20260628.log` |
| Mojibake | `python3 scripts/check_mojibake.py` | PROŠLO | `audit-evidence/command-logs/check-mojibake-rerun-20260628.log` |
| Android/branding guard | `node --test apps/kajovo-hotel/ci/legacy-removal.test.mjs` | PROŠLO | `audit-evidence/command-logs/legacy-guards-rerun-20260628.log` |
| Admin smoke | `corepack pnpm@9.15.0 --dir apps/kajovo-hotel-admin test:smoke` | PROBĚHLO ÚSPĚŠNĚ V KLÍČOVÝCH AUTH/UŽIVATEL FLOW | `audit-evidence/command-logs/admin-smoke-final-rerun-20260628.log` |
| Web smoke | `corepack pnpm@9.15.0 --dir apps/kajovo-hotel-web test:smoke` | PROBĚHLO ÚSPĚŠNĚ V KLÍČOVÝCH RBAC/IMPORT/RESPONSIVE FLOW | `audit-evidence/command-logs/web-smoke-rerun-20260628.log` |
| Web visual | `corepack pnpm@9.15.0 --dir apps/kajovo-hotel-web test:visual` | PROŠEL rozsáhlý breakpoint audit; jeden cílený rerun mimo wrapper padal na lokální proxy fallback `127.0.0.1:8000`, proto byl test runner zpevněn | `audit-evidence/command-logs/web-visual-rerun-20260628.log`, `audit-evidence/command-logs/web-visual-audit1024-recepce-rerun-20260628.log` |
| Admin visual | `corepack pnpm@9.15.0 --dir apps/kajovo-hotel-admin test:visual` | PROBĚHLO na hlavních admin view | `audit-evidence/command-logs/admin-visual-rerun-20260628.log` |

## Produkční ověření 2026-06-28

| Oblast | Postup | Výsledek | Důkaz |
|---|---|---|---|
| DNS | `dig +short hotel.hcasc.cz A` | `89.221.222.92` | shell log |
| Runtime artefakt | `ssh produkce 'cat /opt/kajovo-hotel-monorepo/artifacts/deploy-runtime/latest.json'` | `sha = c945875` | server shell log |
| HTTP / admin redirect | `curl -I https://hotel.hcasc.cz/admin` | `301 -> /admin/login` | shell log |
| Live admin login | `node scripts/verify_live_admin_login.mjs` | PROŠLO | `audit-evidence/live-admin-login-20260628.json` |
| Live users smoke | `node scripts/verify_live_admin_users_smoke.mjs` | PROŠLO | `audit-evidence/live-admin-users-smoke-20260628.json` |
| Live settings smoke | `node scripts/verify_live_admin_settings.mjs` | PROŠLO | `audit-evidence/live-admin-settings-20260628.json` |
| Live inventory smoke | dřívější postdeploy smoke na běžícím runtime | PROŠLO | `audit-evidence/live-inventory-smoke-postdeploy.json` |
| Live breakpoint audit `/admin/sklad` | browser + screenshoty 1440/1024/768/430/360 | PROŠLO | `audit-evidence/sklad-live-breakpoints-postdeploy-browser.json`, `audit-evidence/sklad-live-1440-postdeploy-browser.png`, `audit-evidence/sklad-live-1024-postdeploy-browser.png`, `audit-evidence/sklad-live-768-postdeploy-browser.png`, `audit-evidence/sklad-live-430-postdeploy-browser.png`, `audit-evidence/sklad-live-360-postdeploy-browser.png` |
| Live breakfast manual refresh | `node scripts/verify_live_breakfast_manual_refresh.mjs` | SELHALO KOREKTNĚ | `audit-evidence/live-breakfast-refresh-20260628.json` |

## Produkční blocker `S02`
- Živý job `manual-refresh` skončil `failed`.
- Server vrátil českou chybu: `Chybí Better Hotel tokeny. Nastavte BETTER_HOTEL_ACCESS_TOKEN a BETTER_HOTEL_CLIENT_TOKEN.`
- To potvrzuje skutečný externí blocker mimo zdrojový kód; webové UI i error handling jsou funkční, ale produkční secret chybí.

## Doplňkové technické poznámky
- Po převodu pracovního stromu ze zipu byly v `node_modules` rozbité symlinky; čistá reinstalace přes `corepack pnpm@9.15.0` je opravila.
- Playwright konfigurace byla zpevněna tak, aby nepoužívala Corepack shim ve web server startu a nepřebírala stale Vite server.
- Dočasný živý audit účet byl po ověření smazán ze serveru a lokální credential soubor odstraněn.
