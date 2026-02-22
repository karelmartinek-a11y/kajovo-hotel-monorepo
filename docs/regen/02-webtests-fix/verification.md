# Verification — 02-webtests-fix

## Co bylo cílem

- Najít příčinu neprocházejících web testů a opravit ji.
- Zajistit, aby `pnpm test` pro web aplikaci automaticky připravil Playwright browser.

## Jak ověřeno

1. Reprodukce chyby:
   - `pnpm -C apps/kajovo-hotel-web playwright test tests/ci-gates.spec.ts --max-failures=1`
   - Pozorovaný fail: `browserType.launch: Executable doesn't exist ...` + instrukce `playwright install`.

2. Kontrola konfigurace test commandu:
   - `cat apps/kajovo-hotel-web/package.json`
   - Očekávání po fixu: existuje `scripts.pretest = "playwright install chromium"`.

3. Non-download kontrola bootstrap kroku:
   - `pnpm -C apps/kajovo-hotel-web exec playwright install --dry-run chromium`
   - Očekávání: Playwright rozpozná install plán pro Chromium bez spuštění testů.

## Co se změnilo

- `apps/kajovo-hotel-web/package.json`
  - přidán `pretest` skript: `playwright install chromium`.
  - efekt: při `pnpm test` se nejprve zajistí browser executable.
- `docs/regen/parity/parity-map.yaml`
  - přidán modul `web_e2e_browser_bootstrap` se stavem `DONE`.

## Rizika / known limits

- V prostředí bez internetového přístupu může samotné stažení browseru selhat; v takovém případě je nutné používat cache browser artifacts v CI.
- Tento fix řeší bootstrap browseru; neřeší případné funkční chyby jednotlivých UI testů.
