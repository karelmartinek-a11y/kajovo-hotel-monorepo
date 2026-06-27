# Forenzní důkaz: adminem řízený reset hesla a odblokování účtu

Datum: 2026-03-16

## Cíl

Doložit skutečný end-to-end průchod nového auth kontraktu:

1. reset hesla nevyvolává sám uživatel ani admin z loginu
2. resetovací token může vystavit pouze admin ve správě uživatelů
3. admin účet reset hesla nedostává, pouze připomenutí, kde heslo najde
4. při blokaci účtu po chybných pokusech přijde e-mail s unlock tokenem
5. admin ve správě uživatelů vidí stav blokace a může účet ručně odblokovat

## Runtime pravda

- admin identita má dnes dva runtime tvary:
  - dedikovaný admin účet z `admin_profile`
  - aktivní uživatelský účet s rolí `admin`, který se může přihlásit do admin surface přes `/api/auth/admin/login`
- pro oba tvary platí stejné recovery pravidlo:
  - admin heslo se samo nemění ani neresetuje
  - `POST /api/auth/admin/hint` posílá pouze připomenutí, kde heslo hledat
  - lockout se řeší unlock tokenem nebo ručním odblokováním z users správy

- `POST /api/v1/users/{user_id}/password/reset-link`
  - vytvoří token `purpose = "password_reset"`
  - funguje jen pro ne-admin portálové účty
  - odkaz míří na `/login/reset?token=...`
- `POST /api/auth/change-password`
  - funguje jen pro ne-admin portálové účty
  - admin-role účet dostane `409 Admin account password reminder is handled only via admin login hint`
- `POST /api/auth/reset-password`
  - spotřebuje pouze nepoužitý a neexpirovaný token `purpose = "password_reset"`
  - změní heslo, zneplatní aktivní session a zapíše audit
- `POST /api/auth/admin/hint`
  - neposílá unlock link
  - posílá jen připomenutí, kde admin heslo najde
  - funguje pro dedikovaný admin účet i pro aktivní účet uživatele s admin rolí
- `POST /api/v1/admin/profile/password`
  - endpoint už neexistuje
- `GET /api/auth/unlock`
  - slouží výhradně pro tokeny `purpose = "unlock"`
- `POST /api/v1/users/{user_id}/unlock`
  - ruční admin odblokování z uživatelské správy

## Forenzní body

- `auth_unlock_tokens`
  - reset hesla: `purpose = "password_reset"`
  - odblokování: `purpose = "unlock"`
  - použitý reset token má vyplněné `used_at`
- `auth_lockout_states`
  - drží stav blokace pro `portal` i `admin`
- `audit_trail`
  - `POST /api/auth/reset-password` zapisuje detail `{"password_action": "admin_link_reset", "user_id": <id>}`
  - `POST /api/v1/users/{user_id}/unlock` zapisuje detail `{"lockout_action": "unlock", "user_id": <id>}`
  - audit neobsahuje plaintext hesla

## Důkazní běhy

```powershell
python -m pytest apps/kajovo-hotel-api/tests/test_auth_password_reset.py apps/kajovo-hotel-api/tests/test_auth_lockout.py apps/kajovo-hotel-api/tests/test_auth_constraints.py apps/kajovo-hotel-api/tests/test_users.py apps/kajovo-hotel-api/tests/test_smtp_email_service.py
pnpm contract:generate
pnpm contract:check
pnpm typecheck
```

## Kde je E2E důkaz

- `apps/kajovo-hotel-api/tests/test_auth_password_reset.py`
  - admin vytvoří uživatele
  - admin vystaví reset link
  - test vytáhne skutečně odeslaný e-mail z mail capture
  - uživatel dokončí reset přes `/api/auth/reset-password`
  - staré heslo selže, nové heslo funguje
  - token je jednorázový a audit neuniká heslo
- `apps/kajovo-hotel-api/tests/test_auth_lockout.py`
  - opakované chybné admin loginy vytvoří unlock token a odešlou unlock e-mail
  - admin hint funguje i pro účet uživatele s admin rolí
- `apps/kajovo-hotel-api/tests/test_users.py`
  - users API vrací stav blokace
  - admin reset link pro admin účet vrací konflikt
  - ruční odblokování zapisuje auditní stopu
- `apps/kajovo-hotel-api/tests/test_self_service_profile.py`
  - admin-role účet se může přihlásit do admin surface a upravit profil, ale vlastní změna hesla je blokovaná

## Dotčené soubory

- `apps/kajovo-hotel-api/app/api/routes/auth.py`
- `apps/kajovo-hotel-api/app/api/routes/users.py`
- `apps/kajovo-hotel-api/app/api/schemas.py`
- `apps/kajovo-hotel-api/app/observability.py`
- `apps/kajovo-hotel-api/app/security/auth.py`
- `apps/kajovo-hotel-api/app/services/mail.py`
- `apps/kajovo-hotel-api/tests/test_auth_password_reset.py`
- `apps/kajovo-hotel-api/tests/test_auth_lockout.py`
- `apps/kajovo-hotel-api/tests/test_users.py`
- `apps/kajovo-hotel-api/tests/test_smtp_email_service.py`
- `apps/kajovo-hotel-admin/src/main.tsx`
- `apps/kajovo-hotel-web/src/main.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalLoginPage.tsx`
- `apps/kajovo-hotel-web/src/portal/PortalResetPasswordPage.tsx`

## Závěr

Reset hesla je nově výhradně adminem iniciovaný proces. Admin login neposkytuje reset, jen připomenutí, kde heslo najít. Odblokování účtu zůstává tokenové po lockoutu a zároveň je ručně ovladatelné ze správy uživatelů, včetně auditní stopy.
