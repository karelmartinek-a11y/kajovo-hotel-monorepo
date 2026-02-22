# Prompt ORF-05 – Prompt 07 auth constraints completion verification

## A) Cíl
- Ověřit a dotáhnout fixed admin + immutable password model.
- Sjednotit admin hint email flow přes jednotný mail service contract na API i v Admin UI.
- Přidat explicitní test, že neexistuje endpoint pro změnu admin hesla.

## B) Exit criteria
- Admin login funguje pouze pro fixní `admin_email` + `admin_password` z konfigurace.
- Admin password change endpoint není dostupný.
- Forgot admin password používá pouze hint flow (`/api/auth/admin/hint`), ne změnu hesla.
- Hint flow používá jednotný mail service contract (mock/smtp transport přes stejný interface).
- Lint + typecheck + unit testy proběhnou nebo je blocker explicitně uveden.

## C) Změny
- Přidána mail service vrstva (`MailService`, `MockMailService`, `SmtpMailService`) a helper `send_admin_password_hint`.
- `/api/auth/admin/hint` nyní používá jednotný mail service contract místo inline no-op komentáře.
- Admin login UI doplněno o akci „Poslat hint hesla“ volající `/api/auth/admin/hint`.
- Přidán explicitní API test, že `/api/auth/admin/password` není dostupný (`404`).
- Přidán stabilizační test pro `/api/auth/admin/hint` response.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `python -m pytest apps/kajovo-hotel-api/tests/test_auth_constraints.py`
- PASS: `python -m pytest apps/kajovo-hotel-api/tests`
- PASS: `ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- FAIL (environment): `pnpm --filter @kajovo/kajovo-hotel-admin lint`
  - Důvod: v runneru chybí `node_modules`; TypeScript compiler hlásí missing balíčky (`react`, `@playwright/test`, `@kajovo/*`).

## E) Rizika/known limits
- `SmtpMailService` je zatím kontraktový placeholder transport; produkční SMTP implementace (socket/auth/retry/timeouty) bude doplněna v samostatném promptu.
- Hint endpoint vrací deterministicky `{"ok": true}` a neprozrazuje existenci/validitu jiných emailů.

## F) Handoff pro další prompt
- Při implementaci ostrého SMTP doplnit integrační testy nad `MailService` kontraktem (mock vs smtp) bez změny API/UI flow.
- Zvážit audit trail event pro admin hint request (bez citlivých dat) pro bezpečnostní forenzní dohled.
