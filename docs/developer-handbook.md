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

Web a admin jsou aktivní produkční aplikace. Legacy Android aplikace byla vyřazena a nesmí blokovat změny, CI ani deploy.
