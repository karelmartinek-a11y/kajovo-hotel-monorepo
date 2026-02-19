# Forenzní audit 00 (cleanroom baseline)

## Účel
Tento balík definuje **forenzní baseline** pro následnou cleanroom implementaci KájovoHotel s parity cílem vůči legacy systému.

## Vstupy (jen z repozitáře)
- SSOT design: `ManifestDesignKájovo.md`.
- Brand podklady: `brand/**` (+ referenční signace v `brand/signace/signace.svg`).
- Doménová dokumentace: `docs/**` (audit, parity, kontrakty, RBAC, IA, UAT, provoz).
- Legacy reference (read-only):
  - `legacy/hotel-frontend/**`
  - `legacy/hotel-backend/**`
- Aktuální monorepo stav:
  - `apps/**`
  - `packages/**`

## Pravidla metodiky (cleanroom)
1. Legacy kód je použit pouze pro odvození specifikace (scope/chování/kontrakty), nikoli jako zdroj implementace.
2. Audit neobsahuje kopie implementačních bloků, pouze odvozené popisy.
3. Výstupy jsou psané jako přenosový kontrakt pro další PR kroky.
4. Pokud je chování nejednoznačné, je explicitně zapsán předpoklad do `docs/regen/parity/decisions.md`.

## Rozsah artefaktů
- `legacy-scope.md`: moduly, obrazovky, UX toky.
- `api-surface.md`: endpointy, auth model, očekávané odpovědi.
- `data-model.md`: entity a vztahy.
- `rbac-map.md`: role gating.
- `current-state.md`: proč současný monorepo stav není stabilní baseline.
- `../parity/parity-map.yaml`: strojově čitelná parity mapa.
- `../parity/pr-plan.md`: navazující PR plán.
- `../parity/decisions.md`: rozhodnutí/rizika v ADR stylu.
