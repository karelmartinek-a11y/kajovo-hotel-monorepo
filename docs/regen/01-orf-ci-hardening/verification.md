# ORF-01 CI hardening verification

## A) Cíl
- Zavést CI guardrail, který failne při placeholder odkazech `this-pr*` v `docs/regen/parity/parity-map.yaml`.
- Zpřísnit gate pro `docs/regen/<NN>-<slug>/verification.md`: při změně prompt adresáře musí být součástí změn jeho `verification.md` a musí obsahovat sekce A–F.
- Stabilizovat bootstrap API test serveru (deterministický start/stop, kill fallback) a přidat diagnostický log tail při failu testu.

## B) Exit criteria
- V guardrails jobu existuje parity-placeholder gate.
- Verification gate ověřuje sekce A–F pro každý změněný `docs/regen/<NN>-<slug>/` adresář.
- API health test bootstrap je deterministický a při failu poskytuje server log output.
- `docs/regen/parity/parity-map.yaml` neobsahuje placeholder `this-pr*`.

## C) Změny
- Added `apps/kajovo-hotel/ci/check-parity-map-placeholders.mjs` a nový script `ci:parity-placeholders`.
- Aktualizován `apps/kajovo-hotel/ci/check-pr-verification-doc.mjs` o kontrolu změněných prompt adresářů a sekcí A–F v `verification.md`.
- Aktualizován `.github/workflows/ci-gates.yml` o krok `Parity placeholder gate`.
- Refactor `apps/kajovo-hotel-api/tests/conftest.py`:
  - session fixture `api_server` s readiness loop a early-exit detekcí,
  - deterministické ukončení procesu (`terminate` + `kill` fallback),
  - sběr stdout logů do bounded deque,
  - autouse log dump při failu testu.
- Aktualizován `docs/regen/parity/parity-map.yaml`: odstraněny placeholder links `this-pr*`, nahrazeny konkrétními `docs/regen/*/verification.md` referencemi.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm ci:parity-placeholders`
- PASS: `GITHUB_BASE_REF=main pnpm ci:verification-doc`
- PASS: `python -m pytest apps/kajovo-hotel-api/tests/test_health.py`
- PASS: `python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`

## E) Rizika/known limits
- Kontrola `ci:verification-doc` je PR-oriented (vyžaduje `GITHUB_BASE_REF`), mimo PR kontext se skipuje by design.
- Parity placeholder gate cíleně kontroluje pouze tokeny `this-pr*`; jiné nekonkrétní textové odkazy nejsou blokované.

## F) Handoff pro další prompt
- Rozšířit `ci:verification-doc` o validaci struktury sekce D (automatizované vyhodnocení PASS/FAIL syntaxe).
- Zvážit doplnění guardrail gate na validaci `updated_at` consistency v parity mapě.
