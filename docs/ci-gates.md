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

2. **Brand assets lint (`pnpm ci:brand-assets`)**
   - Ověřuje SSOT soubor `ManifestDesignKájovo.md`.
   - Kontroluje povinnou strukturu assetů:
     - `/signace/signace.(svg|pdf|png)`
     - `apps/kajovo-hotel/logo/sources/logo_master.svg`
     - `apps/kajovo-hotel/logo/exports/{full,mark,wordmark,signace}/{svg,pdf,png}`
   - Validuje technický standard SVG (bez `<text>`, bez efektů, bez opacity < 1, bez stroke).
   - Hlídá povinné barvy a názvosloví exportů včetně PNG velikostí.

3. **SIGNACE gate (`pnpm ci:signage`)**
   - Playwright test přes IA routes:
     - SIGNACE existuje na každé route (mimo PopUp kontext),
     - má text `KÁJOVO`,
     - je viditelná i při scrollu,
     - není occluded jiným prvkem.
   - Konvenční limit brand elementů: max 2 na view (`[data-brand-element="true"]`) na klíčových stránkách.

4. **View-states gate (`pnpm ci:view-states`)**
   - Playwright test, který pro každou route z `apps/kajovo-hotel/ux/ia.json` (module views) ověří dostupnost stavů přes test ID:
     - `loading`
     - `empty`
     - `error`
     - `offline`
     - `404`

5. **WCAG gate (`pnpm ci:wcag`)**
   - Playwright + axe-core kontrola WCAG 2.2 AA (tagy `wcag2*`, `wcag21*`, `wcag22aa`) na IA routách.

## Lokální spuštění

Kompletní gate run:

```bash
pnpm ci:gates
```

Samostatně:

```bash
pnpm ci:tokens
pnpm ci:brand-assets
pnpm ci:signage
pnpm ci:view-states
pnpm ci:wcag
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
5. `pnpm ci:brand-assets`
6. `pnpm ci:signage`
7. `pnpm ci:view-states`
8. `pnpm ci:wcag`


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
