# Developer handbook

## Repo orientace

- `apps/kajovo-hotel-web` – portál
- `apps/kajovo-hotel-admin` – administrace
- `apps/kajovo-hotel-api` – backend
- `packages/shared`, `packages/ui` – sdílený kód

## Povinné kontroly

- Commit a push přímo na `main`, bez nových PR.
- `pnpm ci:gates` (úplný základní plán, viz [CI gates](ci-gates.md))
- relevantní buildy a testy podle dotčené oblasti

## Produktové pravidlo

Základní produkční CI chrání web, admin a API; nativní Android má vlastní CI a release. Release, CI ani deploy nesmí záviset na Android build chainu ani historických parity pravidlech.
