# 01 Guardrails – verification

## A) Cíl
- Zavést sentinely proti regresím:
  - zákaz `/device/*` endpointů;
  - zákaz textu `Entity ID` mimo `legacy/**`;
  - zákaz sdílení `page/view` komponent mezi `portal` a `admin` (primitives zůstávají povolené);
  - whitelist `brand/**` pro hardcoded barvy (např. SVG `fill`).
- Vynutit v CI povinný důkazový soubor `docs/regen/<NN>-*/verification.md` pro každý PR.
- Rozdělit CI na samostatné joby: lint, typecheck, unit tests.

## B) Exit criteria
- Guardrails sentinel failuje při porušení policy pravidel.
- CI kontroluje přítomnost `docs/regen/<NN>-*/verification.md` v PR diffu.
- CI má separované joby `lint`, `typecheck`, `unit-tests`, `policy-guardrails`.

## C) Změny
- Přidán sentinel skript `apps/kajovo-hotel/ci/guardrails-sentinel.mjs`.
- Přidán PR důkazový check `apps/kajovo-hotel/ci/check-regen-verification.mjs`.
- Upraven workflow `.github/workflows/ci-gates.yml`:
  - nové joby `lint`, `typecheck`, `unit-tests`, `policy-guardrails`;
  - PR fail při absenci `docs/regen/<NN>-*/verification.md`;
  - guardrail politika běží v CI.
- Rozšířené npm skripty v root `package.json` o `typecheck`, `test:unit`, `ci:guardrails`, `ci:regen-verification`.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm ci:guardrails`
- PASS: `GITHUB_EVENT_NAME=pull_request GITHUB_BASE_SHA=$(git rev-parse HEAD~1) GITHUB_HEAD_SHA=$(git rev-parse HEAD) pnpm ci:regen-verification`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- FAIL (environment blocker): `pnpm test:unit`

## E) Rizika / known limits
- Sentinel kontroluje změněné soubory podle git diff rozsahu.
- Pravidlo pro `Entity ID` je case-insensitive přes přesnou frázi; varianty bez mezery (`EntityID`) nejsou cílem tohoto guardrailu.
- Pravidlo sdílení admin/portal je zaměřené na importy do `pages?/views?` cest; primitives nejsou blokované.
- `brand/**` je explicitní výjimka pro hardcoded barvy, dokumentováno jako povolená výjimka značky.

## F) Handoff pro další prompt
- Pokud se objeví merge konflikt v CI souborech, preferovat zachování guardrail kroků + explicitní Python 3.11 bootstrap v `unit-tests` jobu.
