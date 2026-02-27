# 02 Guardrails self-fix – verification

## A) Cíl
Opravit false-positive v `ci:guardrails`, kdy sentinel failoval na vlastní implementaci kvůli detekci zakázaných vzorů uvnitř regex definic.

## B) Exit criteria
- `pnpm ci:guardrails` PASS na změnách tohoto kroku.
- Sentinel stále vynucuje zákaz `/device/*` a `Entity ID` na nově přidaných řádcích.
- `docs/regen/parity/parity-map.yaml` obsahuje konkrétní referenci na tento krok bez placeholderu `this-pr` pro modul guardrails.

## C) Změny
- `apps/kajovo-hotel/ci/guardrails-sentinel.mjs`
  - kontrola policy pravidel běží pouze nad **added lines** z `git diff --unified=0` místo celého souboru;
  - přidána cílená výjimka `policySelfExemptFiles` pro `apps/kajovo-hotel/ci/guardrails-sentinel.mjs`;
  - tím je odstraněn self-match na vlastní regex a literály v guardrail skriptu.
- `docs/regen/parity/parity-map.yaml`
  - u modulu `repo_guardrails_sentinel` nahrazen placeholder link konkrétní referencí na tento verifikační soubor.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm ci:guardrails`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- FAIL (environment blocker): `pnpm test:unit`
  - Lokální runtime používá Python 3.10, kde chybí `enum.StrEnum`; API testy cílí na Python 3.11 (jak je definováno v CI workflow).

## E) Rizika / known limits
- Added-lines přístup záměrně nevaliduje starý historický obsah mimo nově přidané řádky.
- Detekce je diff-driven; při nestandardním Git kontextu může být rozsah kontrol omezen na dostupný diff.

## F) Handoff pro další prompt
- Pokud bude požadována širší retrovalidace, přidat volitelný režim full-repo scan spouštěný jen v dedikovaném maintenance jobu (mimo PR blocker).
