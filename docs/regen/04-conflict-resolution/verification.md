# 04 Conflict resolution – verification

## A) Cíl
Vyřešit konfliktní oblasti PR (`.github/workflows/ci-gates.yml`, `docs/regen/01-guardrails/verification.md`, `docs/regen/parity/parity-map.yaml`, `package.json`) do konzistentní finální podoby bez konflikt markerů.

## B) Exit criteria
- U všech cílových souborů nejsou přítomné conflict markery (`<<<<<<<`, `=======`, `>>>>>>>`).
- `ci-gates.yml` zachovává guardrail a unit-test opravy.
- `package.json` má konzistentní CI skripty pro unit test.
- `docs/regen/parity/parity-map.yaml` neobsahuje placeholder `this-pr`.

## C) Změny
- `.github/workflows/ci-gates.yml`
  - sjednocené pojmenování workflow na `KájovoHotel`;
  - `unit-tests` explicitně vypisuje `python --version` a spouští `python -m pytest`.
- `package.json`
  - přidán konzistentní script `ci:unit`;
  - `test:unit` sjednocen na stejný příkaz;
  - scripts seřazené deterministicky (nižší merge drift).
- `docs/regen/01-guardrails/verification.md`
  - převedeno do A-F struktury.
- `docs/regen/parity/parity-map.yaml`
  - odstraněny placeholder odkazy `this-pr`;
  - přidán modul `merge_conflict_resolution_guardrails` se stavem `DONE`.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `rg -n "^(<<<<<<<|=======|>>>>>>>)" .github/workflows/ci-gates.yml docs/regen/01-guardrails/verification.md docs/regen/parity/parity-map.yaml package.json`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- FAIL (environment blocker): `pnpm test:unit` (lokální Python 3.10 neobsahuje `enum.StrEnum`; CI cílí Python 3.11)

## E) Rizika / known limits
- Lokálně není dostupný `origin` remote, proto merge proti vzdálené větvi není možné ověřit příkazem `git merge origin/main`.
- Konflikt řešen konzolidací aktuálního branch stavu do deterministické podoby pro snížení budoucích konfliktů.

## F) Handoff pro další prompt
- Pokud bude dostupný vzdálený remote, provést finální merge/rebase proti cílové větvi a spustit celé CI gates.
