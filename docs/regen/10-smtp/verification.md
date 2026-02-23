## A) Cíl
- ORF-07 Prompt 10: SMTP admin settings (secure storage, masked secrets, test-email), sjednocení EmailService pro admin hint + onboarding, integrační test s mock SMTP transportem.

## B) Exit criteria
- Admin API má endpointy pro uložení/čtení SMTP konfigurace a test-email.
- SMTP heslo se nevrací v plaintextu (jen maskované) a ukládá se šifrovaně.
- Hint email i onboarding email používají stejný `EmailService` modul.
- Existuje integrační test s mock SMTP transportem, který ověřuje hint + test-email + onboarding flow.

## C) Změny
- Synchronizován API kontrakt po SMTP změnách: aktualizovány `apps/kajovo-hotel-api/openapi.json` a `packages/shared/src/generated/client.ts` přes `pnpm contract:generate`.
- Přidána persistovaná SMTP konfigurace (`portal_smtp_settings`) + migrace.
- Přidán nový `settings` router: `GET/PUT /api/v1/admin/settings/smtp`, `POST /api/v1/admin/settings/smtp/test-email`.
- Refaktor `app/services/mail.py` na jednotný `EmailService` modul s:
  - šifrováním/ověřením SMTP secret,
  - maskováním secretu,
  - SMTP implementací + mock transportem,
  - funkcemi `send_admin_password_hint` a `send_portal_onboarding`.
- `admin_hint` flow používá nový jednotný email service.
- `users.create_user` posílá onboarding email přes stejný modul.
- Přidán integrační test `test_smtp_email_service.py` s mock SMTP transportem.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm contract:generate`
- PASS: `pnpm contract:check`
- PASS: `cd apps/kajovo-hotel-api && ruff check app tests`
- PASS: `cd apps/kajovo-hotel-api && pytest -q tests/test_smtp_email_service.py tests/test_auth_constraints.py`

## E) Rizika/known limits
- Šifrování SMTP secretu je app-level (symetrický klíč z env), bez externího KMS/HSM.
- Admin UI pro SMTP settings není v tomto promptu implementováno; pokryt je API backend.

## F) Handoff pro další prompt
- Doplnit Admin UI obrazovku pro SMTP settings v `apps/kajovo-hotel-admin` (form + masked secret + test-email akce).
- Rozšířit API kontrakt v `packages/shared/src/generated/client.ts` regenerací klienta.
