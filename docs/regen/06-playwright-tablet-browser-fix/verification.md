# Verification — 06-playwright-tablet-browser-fix

## Co bylo cílem

- Opravit pád CI web testů na tablet projektu:
  - `Executable doesn't exist ... /ms-playwright/webkit-2248/pw_run.sh`
- Sjednotit browser engine test projektů s tím, co CI instaluje (`chromium`).

## Jak ověřeno

1. Kontrola Playwright konfigurace:
   - `cat apps/kajovo-hotel-web/playwright.config.ts`
   - Očekávání: `tablet` projekt nepoužívá `iPad (gen 7)` (WebKit), ale Chromium profil.

2. Typecheck:
   - `pnpm -C apps/kajovo-hotel-web lint`
   - Očekávání: bez chyb.

3. Ověření seznamu testů přes package script:
   - `pnpm --filter @kajovo/kajovo-hotel-web test -- --list`
   - Očekávání: test matrix se spustí nad browsery dostupnými v CI browser-install kroku.

## Co se změnilo

- `apps/kajovo-hotel-web/playwright.config.ts`
  - `tablet` projekt změněn z `devices['iPad (gen 7)']` (WebKit) na Chromium profil:
    - `...devices['Desktop Chrome']`
    - `viewport: { width: 834, height: 1112 }`

- `docs/regen/parity/parity-map.yaml`
  - přidán modul `web_playwright_browser_parity` se stavem `DONE`.

## Rizika / known limits

- Změna řeší CI browser bootstrap kompatibilitu (chromium-only install).
- Není to simulace iOS Safari/WebKit; pokud je WebKit coverage požadována, CI musí instalovat i WebKit browser.
