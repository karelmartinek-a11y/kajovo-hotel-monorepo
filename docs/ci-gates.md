# CI gates pro Kájovo Hotel

Tento dokument popisuje **blokující** CI gate pravidla pro PR i `main` větev.

## Přehled gate kroků

1. **Token-only lint (`pnpm ci:tokens`)**
   - Ověřuje SSOT konzistenci v:
     - `apps/kajovo-hotel/ui-tokens/tokens.json`
     - `apps/kajovo-hotel/palette/palette.json`
     - `apps/kajovo-hotel/ui-motion/motion.json`
   - Failne build, pokud se mimo token usage objeví ad-hoc hodnoty pro:
     - color
     - spacing
     - radius
     - shadow
     - z-index
     - motion
   - Kontroluje závazné SIGNACE hodnoty (`KÁJOVO`, `#FF0000`, `#FFFFFF`, fixed-left-bottom, visible on scroll).

2. **SIGNACE gate (`pnpm ci:signage`)**
   - Playwright test přes IA routes:
     - SIGNACE existuje na každé route (mimo PopUp kontext),
     - má text `KÁJOVO`,
     - je viditelná i při scrollu,
     - není occluded jiným prvkem.
   - Konvenční limit brand elementů: max 2 na view (`[data-brand-element="true"]`) na klíčových stránkách.

3. **View-states gate (`pnpm ci:view-states`)**
   - Playwright test, který pro každou route z `apps/kajovo-hotel/ux/ia.json` (module views) ověří dostupnost stavů přes test ID:
     - `loading`
     - `empty`
     - `error`
     - `offline`
     - `404`

## Lokální spuštění

Kompletní gate run:

```bash
pnpm ci:gates
```

Samostatně:

```bash
pnpm ci:tokens
pnpm ci:signage
pnpm ci:view-states
```

Doporučené před prvním během Playwright gate:

```bash
pnpm --filter @kajovo/kajovo-hotel-web exec playwright install --with-deps chromium
```

## CI workflow

Workflow je v `.github/workflows/ci-gates.yml`.

Pipeline je blokující v PR i pro push do `main` a obsahuje:

1. dependency install
2. playwright browser install
3. `pnpm lint`
4. `pnpm ci:tokens`
5. `pnpm ci:signage`
6. `pnpm ci:view-states`


## Lokální Playwright sweep (smoke + SIGNACE + snapshoty)

Pro kompletní vizuální sweep (IA smoke navigace, SIGNACE, view-states a screenshot baseline):

```bash
pnpm --filter @kajovo/kajovo-hotel-web exec playwright test --project=desktop tests/ci-gates.spec.ts
pnpm --filter @kajovo/kajovo-hotel-web exec playwright test --update-snapshots tests/visual.spec.ts
```

Tip: pokud měníte pouze subset modulů, můžete spustit jen cílený grep:

```bash
pnpm --filter @kajovo/kajovo-hotel-web exec playwright test --update-snapshots --grep "breakfast|inventory|reports|issues|lost found" tests/visual.spec.ts
```
