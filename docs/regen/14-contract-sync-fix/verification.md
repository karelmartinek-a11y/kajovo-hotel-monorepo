# ORF-14 Contract sync fix Verification

## A) Cíl

Opravit failing CI krok způsobený nesynchronizovaným OpenAPI kontraktem a generovaným TS klientem po přidání user/password endpointů.

## B) Exit criteria

- `apps/kajovo-hotel-api/openapi.json` je synchronní s aktuálním API.
- `packages/shared/src/generated/client.ts` obsahuje odpovídající metody/typy pro user/password endpointy.
- `pnpm contract:check` prochází.
- `pnpm lint`, `pnpm typecheck`, `pnpm unit` prochází.

## C) Změny

- Regenerován OpenAPI export (`apps/kajovo-hotel-api/openapi.json`).
- Regenerován sdílený TS klient (`packages/shared/src/generated/client.ts`) včetně metod:
  - `setUserPasswordApiV1UsersUserIdPasswordPost`
  - `resetUserPasswordApiV1UsersUserIdPasswordResetPost`

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `pnpm contract:check`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`

## E) Rizika / known limits

- Generovaný klient odráží aktuální generátor; behavior request helperu (cookies/CSRF) je dán skriptem v `packages/shared/scripts/generate_client.py`.

## F) Handoff pro další prompt

- Při změně API rout/schemas vždy spustit `pnpm contract:generate` a commitnout oba výstupy (`openapi.json` + `client.ts`).
