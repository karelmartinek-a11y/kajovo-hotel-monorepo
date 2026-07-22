# Developer handbook

## Repo orientace

- `apps/kajovo-hotel-web` – portál
- `apps/kajovo-hotel-admin` – administrace
- `apps/kajovo-hotel-api` – backend
- `packages/shared`, `packages/ui` – sdílený kód

## Povinné kontroly

- `pnpm ci:policy`
- `pnpm ci:policy-test`
- `pnpm typecheck`
- relevantní buildy a testy podle dotčené oblasti

## Produktové pravidlo

Repozitář aktivně provozuje pouze web, admin a API. Release, CI ani deploy nesmí záviset na Android build chainu ani historických parity pravidlech.
