# 05 Conflict resolution v2 – verification

## A) Cíl
Snížit pravděpodobnost opakovaných merge konfliktů v souborech:
- `.github/workflows/ci-gates.yml`
- `docs/regen/01-guardrails/verification.md`
- `docs/regen/parity/parity-map.yaml`
- `package.json`

## B) Exit criteria
- Konfliktní soubory mají stabilní, minimálně churnující podobu.
- CI klíčové kroky zůstávají zachované (`unit-tests` přes Python, guardrails + regen verification scripty).

## C) Změny
- `package.json`: stabilizované pořadí scripts a zachované CI skripty (`test:unit`, `ci:unit`, `ci:guardrails`, `ci:regen-verification`).
- `.github/workflows/ci-gates.yml`: sjednocen název workflow na `CI Gates - Kájovo Hotel` pro lepší shodu s dřívějším stavem.
- `docs/regen/parity/parity-map.yaml`: doplněna reference na tento verifikační krok.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `rg -n "^(<<<<<<<|=======|>>>>>>>)" .github/workflows/ci-gates.yml docs/regen/01-guardrails/verification.md docs/regen/parity/parity-map.yaml package.json`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- FAIL (environment blocker): `pnpm test:unit` (lokální Python 3.10 neobsahuje `enum.StrEnum`; CI cílí Python 3.11)

## E) Rizika/known limits
- V tomto prostředí není nastaven `origin` remote, nelze provést skutečný merge/rebase proti cílové větvi.
- Konečné vyřešení PR konfliktu proběhne při aplikaci tohoto commitu na konfliktující branch s dostupným upstream remote.

## F) Handoff pro další prompt
- Na branch s upstream remoten spusť:
  - `git fetch origin`
  - `git merge origin/main` (nebo cílovou base větev)
  - vyřeš případné zbytky konfliktů a push.
