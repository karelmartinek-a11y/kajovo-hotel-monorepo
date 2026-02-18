# Jak spustit Kájovo Hotel Web

## Požadavky
- Node.js 20+
- pnpm 9+

## Instalace
```bash
pnpm install
```

## Lokální vývoj
```bash
pnpm --filter @kajovo/kajovo-hotel-web dev
```

## Build
```bash
pnpm --filter @kajovo/kajovo-hotel-web build
```

## Lint
```bash
pnpm lint
```

## Playwright testy
```bash
pnpm test
```

Testy generují snapshoty pro desktop/tablet/phone pro dashboard a modul Snídaně (seznam + detail) včetně testu viditelnosti SIGNACE.
