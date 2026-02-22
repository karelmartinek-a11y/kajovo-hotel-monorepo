# ORF-15 Policy Entity ID fix Verification

## A) Cíl

Opravit fail `Policy sentinel failed: Entity ID detected ...` odstraněním `entity_id` namingu z API schema/modelu a generovaného klienta.

## B) Exit criteria

- `pnpm ci:policy` prochází bez `Entity ID detected`.
- `apps/kajovo-hotel-api/app/api/schemas.py`, `apps/kajovo-hotel-api/app/db/models.py`, `packages/shared/src/generated/client.ts` neobsahují `entity_id`.
- `pnpm contract:check`, `pnpm lint`, `pnpm typecheck`, `pnpm unit` prochází.

## C) Změny

- Přejmenováno `entity_id` -> `resource_id` v:
  - `apps/kajovo-hotel-api/app/api/schemas.py`
  - `apps/kajovo-hotel-api/app/db/models.py`
  - `apps/kajovo-hotel-api/app/api/routes/inventory.py`
- Regenerován kontrakt a klient:
  - `apps/kajovo-hotel-api/openapi.json`
  - `packages/shared/src/generated/client.ts`
- Aktualizován web test fixture payload pro audit log (`resource_id`) v `apps/kajovo-hotel-web/tests/visual.spec.ts`.

## D) Ověření (přesné příkazy + PASS/FAIL)

- PASS: `pnpm ci:policy`
- PASS: `pnpm contract:check`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`

## E) Rizika / known limits

- DB sloupec byl přejmenován na `resource_id`; při migraci existující produkční DB je potřeba explicitní migration-step.

## F) Handoff pro další prompt

- Vyhnout se `entity_id` terminologii v nových schématech/modelech/klientech; používat `resource_id`.
