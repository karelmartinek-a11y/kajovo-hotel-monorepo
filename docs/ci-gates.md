# CI gate pro Kajovo Hotel

Tento dokument popisuje skutečné blokující kontroly pro `main` a jejich vztah ke KDGS.

## 1. Autorita

Autoritativní zdroje:

- [`docs/Kajovo_Design_Governance_Standard_SSOT.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/Kajovo_Design_Governance_Standard_SSOT.md)
- [`docs/forenzni-plan-implementace-kdgs-2026-03-16.md`](/C:/GitHub/kajovo-hotel-monorepo/docs/forenzni-plan-implementace-kdgs-2026-03-16.md)
- [`/.github/workflows/ci-gates.yml`](/C:/GitHub/kajovo-hotel-monorepo/.github/workflows/ci-gates.yml)
- [`/.github/workflows/ci-full.yml`](/C:/GitHub/kajovo-hotel-monorepo/.github/workflows/ci-full.yml)
- [`/.github/workflows/deploy-production.yml`](/C:/GitHub/kajovo-hotel-monorepo/.github/workflows/deploy-production.yml)

Pokud se tento dokument rozchází s workflow soubory, platí workflow soubory.

## 2. Lokální skripty

### `pnpm ci:gates`

Lokální frontend gate v root [`package.json`](/C:/GitHub/kajovo-hotel-monorepo/package.json):

1. `pnpm ci:tokens`
2. `pnpm ci:brand-assets`
3. `pnpm ci:signage`
4. `pnpm ci:text-integrity`
5. `pnpm ci:frontend-manifest`
6. `pnpm ci:runtime-integrity`
7. `pnpm ci:web-smoke`
8. `pnpm ci:visual`

Tento skript je důležitý, ale není to celý release gate.

### Další důležité lokální skripty

- `pnpm ci:policy`
- `pnpm contract:check`
- `pnpm ci:visual`
- `pnpm ci:e2e-smoke`
- `pnpm typecheck`
- `pnpm unit`

## 3. GitHub workflow `CI Gates - KajovoHotel`

Workflow: [`ci-gates.yml`](/C:/GitHub/kajovo-hotel-monorepo/.github/workflows/ci-gates.yml)

Obsahuje tyto blokující joby:

### `release-gate`

Pouští sjednocený release gate přes [`scripts/release_gate.py`](/C:/GitHub/kajovo-hotel-monorepo/scripts/release_gate.py).

Aktuálně spouští:

- `pnpm typecheck`
- build webu
- build adminu
- `python -m pytest apps/kajovo-hotel-api/tests -q`
- `pnpm ci:gates`
- `pnpm ci:visual`
- `pnpm ci:e2e-smoke`

### `e2e-smoke`

Třikrát deterministicky spouští admin smoke:

- `pnpm ci:e2e-smoke`

nad dočasnou smoke databází a lokálně spuštěným API.

### `guardrails`

Samostatně blokuje:

- `pnpm ci:policy`
- `pnpm ci:tokens`
- `pnpm ci:brand-assets`
- `pnpm ci:signage`
- `pnpm ci:web-smoke`
- `pnpm ci:visual`
- `pnpm contract:check`

### `lint`

Blokuje `ruff` lint pro API.

### `typecheck`

Blokuje `pnpm typecheck`.

### `unit-tests`

Blokuje `pnpm unit`.

## 4. GitHub workflow `CI Full - Kajovo Hotel`

Workflow: [`ci-full.yml`](/C:/GitHub/kajovo-hotel-monorepo/.github/workflows/ci-full.yml)

Aktuálně obsahuje:

- plné API testy (`pytest`)
- web Playwright běh
- admin `e2e-smoke`
- lint a `contract:check`
- samostatný auth smoke

Tento workflow je důkazní a regresní vrstva navíc nad `CI Gates - KajovoHotel`.

## 5. Produkční deploy gate

Workflow: [`deploy-production.yml`](/C:/GitHub/kajovo-hotel-monorepo/.github/workflows/deploy-production.yml)

Deploy na `hotel.hcasc.cz` se spouští jen po úspěšném `CI Gates - KajovoHotel` na `main`, nebo ručně.

Po deployi blokují release ještě tyto kontroly:

- ověření deploy target env
- ověření admin credentials env
- ověření runtime artifact SHA na serveru
- HTTP gate:
  - `GET /`
  - `GET /admin/login`
  - `GET /api/health`
- live admin login
- live smoke správy uživatelů

## 6. Vztah ke KDGS

KDGS vyžaduje, aby release blokoval minimálně:

- porušení brand pravidel,
- chybějící povinné stavy view,
- token drift,
- layoutové a ergonomické rozpady,
- nehotové nebo falešné výstupy.

Aktuální stav:

- brand a tokeny jsou v gate zapojené,
- text integrity a runtime integrity jsou v gate zapojené,
- smoke testy jsou v gate zapojené,
- contract freshness je v gate zapojená,
- vykonávaný KDGS geometrický a vizuální důkaz je zapojený přes `ci:visual` pro web i admin.

## 7. Doporučené lokální minimum před push

```bash
pnpm typecheck
pnpm unit
pnpm ci:gates
pnpm ci:e2e-smoke
pnpm contract:check
```

Pokud změna sahá do API lintu nebo workflow:

```bash
python -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests
```
