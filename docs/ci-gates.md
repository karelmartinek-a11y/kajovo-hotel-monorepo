# CI gates

Aktivní blokující kontroly jsou zaměřené na web, admin, API a produkční deploy integritu.

## Hlavní gate

- `pnpm ci:policy`
- `pnpm ci:policy-test`
- `pnpm ci:tokens`
- `pnpm ci:brand-assets`
- `pnpm ci:signage`
- `pnpm ci:text-integrity`
- `pnpm ci:frontend-manifest`
- `pnpm ci:runtime-integrity`
- `pnpm ci:web-smoke`
- `pnpm ci:visual`
- `pnpm contract:check`
- `pnpm typecheck`
- `python3.11 -m ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- `python3.11 scripts/release_gate.py`

## GitHub Actions mapování

- `.github/workflows/ci-gates.yml`: `release-gate`, `e2e-smoke`, `guardrails`, `lint`, `typecheck`, `unit-tests`
- `.github/workflows/deploy-production.yml`: deploy pouze po úspěšném `CI Gates - Kajovo Hotel` na `main`
