# 04 Auth foundation – verification

## Cíl
Nahradit URL token/test hook autentizaci session cookies a zavést auth endpointy pro admin + portal.

## Co se změnilo
- Přidána tabulka `portal_users` + migrace.
- Přidány auth endpointy (`/api/auth/*`) včetně `/me`, admin hint endpointu a session cookie flow.
- RBAC a audit identity čtou identitu ze session.
- Přidána minimální CSRF ochrana pro write requesty.
- Web client načítá identitu z `/api/auth/me`, bez `access_token` v URL.

## Jak ověřeno
1. `cd apps/kajovo-hotel-api && pytest`
   - Očekávání: RBAC testy projdou s login + session + CSRF flow.
2. `cd /workspace/kajovo-hotel-monorepo && pnpm --filter @kajovo/shared lint`
   - Očekávání: TS client změny bez lint chyb.

## Rizika / known limits
- `POST /api/auth/admin/hint` je zatím ve disabled SMTP mode (jen potvrzuje požadavek).
- Session je podepsaná HMAC tokenem bez server-side revocation listu (logout maže cookie na klientovi).
