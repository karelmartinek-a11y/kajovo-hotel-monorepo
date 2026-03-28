# Testing

Tento dokument popisuje current-state testovací vrstvy v repozitáři.

## 1. Základní lokální sada

```bash
pnpm typecheck
pnpm unit
pnpm contract:check
pnpm ci:policy
pnpm ci:policy-test
pnpm ci:gates
pnpm ci:e2e-smoke
```

## 2. Co jednotlivé příkazy kryjí

### `pnpm typecheck`

- TypeScript kontrola webu a adminu

### `pnpm unit`

- backend unit testy přes `pytest`

### `pnpm contract:check`

- regenerace OpenAPI a sdíleného klienta
- blokace driftu mezi API a `packages/shared`

### `pnpm ci:policy`

- nepřerušená web-Android runtime parita

### `pnpm ci:policy-test`

- testy pravidel parity guardu

### `pnpm ci:gates`

- token guard
- brand asset guard
- signage guard
- text integrity guard
- frontend manifest guard
- policy guard test
- Android release integrity
- Android smoke
- runtime integrity
- web smoke
- vizuální testy

### `pnpm ci:e2e-smoke`

- admin smoke přes Playwright

## 3. Doporučené doplňkové běhy

Python API lint:

```bash
python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests
```

Web smoke:

```bash
pnpm ci:web-smoke
```

Visual:

```bash
pnpm ci:visual
```

Android integrity:

```bash
python scripts/check_android_release_integrity.py
```
