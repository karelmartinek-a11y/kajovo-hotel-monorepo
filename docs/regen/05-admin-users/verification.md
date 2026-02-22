# Verification — 05 Admin Users

## Cíl
Dodat jediný kanál autorizace přes Admin správu uživatelů: API CRUD + Admin UI + audit trail.

## Co se změnilo
- Přidán API modul `/api/v1/users` pro list/detail/create/enable-disable/set-reset password.
- Rozšířen RBAC o `users:read`/`users:write`.
- Upraven audit middleware: maskování payloadu s heslem + explicitní audit detail override pro password akce.
- Přidána Admin route `/uzivatele` s tabulkou uživatelů, detailem a create formulářem.
- Aktualizována parity mapa pro modul `user_management_only_auth`.

## Jak ověřeno
- `pytest apps/kajovo-hotel-api/tests/test_users.py`
  - očekáváno: admin vytvoří uživatele, aktivuje/deaktivuje, resetuje heslo, nový user se přihlásí na portál.
  - očekáváno: audit detail neobsahuje plaintext hesla.
- `pytest apps/kajovo-hotel-api/tests/test_rbac.py`
  - očekáváno: RBAC stále funguje a deny zápis se auditují.
- `pnpm --filter @kajovo/kajovo-hotel-web lint`
  - očekáváno: TypeScript build/lint projde po přidání nové admin users route.

## Rizika / known limits
- V jednom web entrypointu zůstává společný shell pro admin/portal; separace na oddělené app entrypointy je nad rámec kroku a zůstává v parity mapě jako `admin_portal_split`.
- Create formulář nastavuje výchozí roli `manager`; role management není součástí tohoto kroku.
