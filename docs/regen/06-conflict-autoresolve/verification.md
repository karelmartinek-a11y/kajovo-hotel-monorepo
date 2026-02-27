# 06 Conflict autoresolve guard – verification

## A) Cíl
Zastavit opakované konflikty v PR pro 4 stále stejné soubory přidáním merge guardrail pravidel.

## B) Exit criteria
- Repo obsahuje `.gitattributes` pravidla pro konfliktové soubory.
- Pravidla cílí přesně na:
  - `.github/workflows/ci-gates.yml`
  - `docs/regen/01-guardrails/verification.md`
  - `docs/regen/parity/parity-map.yaml`
  - `package.json`
- Ostatní quality gates jsou znovu ověřené.

## C) Změny
- Přidán `.gitattributes` s pravidlem `merge=ours` pro 4 opakovaně konfliktující cesty.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `cat .gitattributes`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- FAIL (environment blocker): `pnpm test:unit` (lokální Python 3.10 nemá `enum.StrEnum`; CI používá Python 3.11)

## E) Rizika/known limits
- `merge=ours` preferuje tuto větev pro cílené soubory; změny z druhé větve se v konfliktním merge do těchto souborů nepřevezmou automaticky.
- Toto je záměrný anti-conflict trade-off pro stabilizaci PR mergeability.

## F) Handoff pro další prompt
- Po sloučení ověřit obsah těchto 4 souborů proti cílové větvi a případně udělat samostatný harmonizační cleanup PR.
