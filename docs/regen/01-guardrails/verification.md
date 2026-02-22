# 01 Guardrails – verification

## Cíl
- Zavést sentinely proti regresím:
  - zákaz `/device/*` endpointů;
  - zákaz textu `Entity ID` mimo `legacy/**`;
  - zákaz sdílení `page/view` komponent mezi `portal` a `admin` (primitives zůstávají povolené);
  - whitelist `brand/**` pro hardcoded barvy (např. SVG `fill`).
- Vynutit v CI povinný důkazový soubor `docs/regen/<NN>-*/verification.md` pro každý PR.
- Rozdělit CI na samostatné joby: lint, typecheck, unit tests.

## Jak ověřeno
1. `pnpm ci:guardrails`
   - Očekávání: skript projde bez chyb na aktuálním diffu a vypíše počet zkontrolovaných souborů.
2. `GITHUB_EVENT_NAME=pull_request GITHUB_BASE_SHA=$(git rev-parse HEAD~1) GITHUB_HEAD_SHA=$(git rev-parse HEAD) pnpm ci:regen-verification`
   - Očekávání: kontrola projde, pokud diff obsahuje `docs/regen/<NN>-*/verification.md`.
3. `pnpm lint`
   - Očekávání: lint projde.
4. `pnpm typecheck`
   - Očekávání: typecheck projde.
5. `pnpm test:unit`
   - Očekávání: unit testy API projdou.

## Co se změnilo
- Přidán sentinel skript `apps/kajovo-hotel/ci/guardrails-sentinel.mjs`.
- Přidán PR důkazový check `apps/kajovo-hotel/ci/check-regen-verification.mjs`.
- Upraven workflow `.github/workflows/ci-gates.yml`:
  - nové joby `lint`, `typecheck`, `unit-tests`, `policy-guardrails`;
  - PR fail při absenci `docs/regen/<NN>-*/verification.md`;
  - guardrail politika běží v CI.
- Rozšířené npm skripty v root `package.json` o `typecheck`, `test:unit`, `ci:guardrails`, `ci:regen-verification`.

## Rizika / known limits
- Sentinel kontroluje změněné soubory podle git diff rozsahu; při nestandardním CI checkoutu fallbackne na `git ls-files`.
- Pravidlo pro `Entity ID` je case-insensitive přes přesnou frázi; varianty bez mezery (`EntityID`) nejsou cílem tohoto guardrailu.
- Pravidlo sdílení admin/portal je zaměřené na importy do `pages?/views?` cest; primitives nejsou blokované.
- `brand/**` je explicitní výjimka pro hardcoded barvy, dokumentováno jako povolená výjimka značky.
