# ORF-15 View states auth/me mock fix Verification

## A) Cíl

Opravit CI gate `ci:view-states` fail `Missing loading state on /snidane` tím, že Playwright gate test explicitně mockuje `/api/auth/me` a nečeká na nespolehlivou síť/auth bootstrap.

## B) Exit criteria

- `tests/ci-gates.spec.ts` má deterministic mock pro `/api/auth/me`.
- View-state smoke test neblokuje auth bootstrap path.
- `pnpm lint`, `pnpm typecheck`, `pnpm unit` prochází.

## C) Změny

- `apps/kajovo-hotel-web/tests/ci-gates.spec.ts`:
  - přidán `page.route('**/api/auth/me', ...)` v `beforeEach` s manager read permissions.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- WARNING (env blocker): `pnpm ci:view-states` nelze lokálně verifikovat bez Playwright browser binary v tomto prostředí.

## E) Rizika / known limits

- Gate test nyní záměrně izoluje auth endpoint od backend dostupnosti; změny auth kontraktu je potřeba promítnout do mock payloadu.

## F) Handoff pro další prompt

- U dalších web gate testů mockovat `/api/auth/me` explicitně, pokud test nevaliduje auth backend integraci.
