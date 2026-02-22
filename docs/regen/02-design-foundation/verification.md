# Verification — 02 design foundation

## Cíl

1. Upevnit jednotné design tokeny (barvy, spacing, radius, typografie) podle manifestu.
2. Zavést signaci jako viditelný, neblokující komponent s assetem ze SSOT (`brand/signace`).
3. Zavést mechanismus přenosu panel layoutu do sdílených komponent.
4. Dodat e2e ověření přítomnosti signace na klíčových routách.

## Co se změnilo

- `packages/ui/src/tokens.css` sjednocuje runtime tokeny + panel layout tokeny (`data-panel-layout`).
- `packages/ui/src/shell/KajovoSign.tsx` používá `brand` signaci přes SVG asset (ne textový placeholder).
- `packages/ui/src/shell/AppShell.tsx` podporuje `panelLayout` (`admin`/`portal`) a propaguje jej do shellu.
- `apps/kajovo-hotel-web/src/main.tsx` mapuje roli na `panelLayout`.
- `apps/kajovo-hotel-web/tests/signage-routes.spec.ts` přidán e2e smoke test přítomnosti signace na klíčových routách.
- `apps/kajovo-hotel-web/tests/ci-gates.spec.ts` upraven pro SVG-based signaci (ověřuje `aria-label`, přítomnost `<img>` a `src` na `signace.svg` místo textové/flat-color varianty).
- `apps/kajovo-hotel/ui-tokens/tokens.css` je delegační import na shared runtime tokeny (bez duplicity implementace).

## Ověření (příkazy + očekávání)

- `pnpm --filter @kajovo/kajovo-hotel-web test -- tests/signage-routes.spec.ts`
  - výsledek v tomto prostředí: nelze dokončit, protože Playwright browser binary chybí a CDN vrací 403 při instalaci (`pnpm exec playwright install chromium`).
- `pnpm --filter @kajovo/kajovo-hotel-web lint`
  - očekávání: TypeScript/React lint build bez chyb.
- `pnpm ci:tokens`
  - očekávání: token lint pass (SSOT token schema + signage constraints).

## Rizika / known limits

- Admin/Portal split jako separátní entry aplikace je stále backlog položka; tento krok řeší pouze design foundation (shared tokeny + panel layout mechanismus), ne kompletní split aplikací.
- E2E běh je vázán na dostupnost Playwright browser download endpointu.
