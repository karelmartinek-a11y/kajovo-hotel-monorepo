# Jak spustit web a admin

Detail k celému lokálnímu setupu je v `docs/how-to-run.md`. Tento dokument je jen stručný přehled pro frontend.

## Portálový web

```bash
pnpm --filter @kajovo/kajovo-hotel-web dev
```

## Admin

```bash
pnpm --filter @kajovo/kajovo-hotel-admin dev
```

## Build

```bash
pnpm --filter @kajovo/kajovo-hotel-web build
pnpm --filter @kajovo/kajovo-hotel-admin build
```

## Testy

```bash
pnpm ci:web-smoke
pnpm ci:e2e-smoke
pnpm ci:visual
```
