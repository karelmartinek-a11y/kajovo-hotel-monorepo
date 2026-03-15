# CI gates pro Kajovo Hotel

Tento dokument popisuje blokující CI kontroly pro `main`.

## Přehled gate kroků

1. `pnpm ci:tokens`
   - kontrola SSOT tokenů, barev a brand pravidel
2. `pnpm ci:brand-assets`
   - kontrola povinných brand assetů a SVG standardu
3. `pnpm ci:text-integrity`
   - kontrola rozbitých textů a kódování
4. `pnpm ci:frontend-manifest`
   - kontrola frontend manifest guardů
5. `pnpm ci:runtime-integrity`
   - grep gate na zakázané runtime tokeny a test hooky v produkčním kódu
6. `pnpm ci:web-smoke`
   - živý web smoke nad reálným API přes `apps/kajovo-hotel-web/tests/live-smoke.spec.ts`

## Lokální spuštění

Kompletní gate:

```bash
pnpm ci:gates
```

Samostatně:

```bash
pnpm ci:tokens
pnpm ci:brand-assets
pnpm ci:text-integrity
pnpm ci:frontend-manifest
pnpm ci:runtime-integrity
pnpm ci:web-smoke
```

## CI workflow

Workflow je v `/.github/workflows/ci-gates.yml`.

Blokující pipeline obsahuje:

1. install závislostí
2. lint
3. `pnpm ci:tokens`
4. `pnpm ci:brand-assets`
5. `pnpm ci:text-integrity`
6. `pnpm ci:frontend-manifest`
7. `pnpm ci:runtime-integrity`
8. `pnpm ci:web-smoke`

## Playwright smoke

Web smoke:

```bash
pnpm --filter @kajovo/kajovo-hotel-web test:smoke
```

Admin smoke:

```bash
pnpm --filter @kajovo/kajovo-hotel-admin test:smoke
```
