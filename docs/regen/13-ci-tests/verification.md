# Prompt 13 – CI E2E smoke stabilizace

## A) Cíl
- Stabilizovat Playwright smoke v CI pro auth scénáře přes reálně orchestrace API + admin + portal služby.
- Pokrýt povinné scénáře:
  1. admin login (fixed admin)
  2. admin hint email flow (mock transport při `KAJOVO_API_SMTP_ENABLED=false`)
  3. user create + portal login

## B) Exit criteria
- CI obsahuje dedikovaný `e2e-smoke` job s browser provisioning krokem a timeout budget.
- Playwright smoke suite orchestruje API + admin + portal služby deterministicky (single worker, retry budget, fixní porty).
- Smoke test explicitně provádí všechny 3 povinné auth scénáře.
- `docs/regen/parity/parity-map.yaml` obsahuje mapování evidence na tuto změnu.

## C) Změny
- Přidán Playwright smoke config pro orchestrace API + admin + portal služeb: `apps/kajovo-hotel-web/tests/e2e-smoke.config.ts`.
- Přidán smoke test auth flow: `apps/kajovo-hotel-web/tests/e2e-smoke/auth-smoke.spec.ts`.
- Přidán pomocný API init script pro deterministické vytvoření DB schématu bez migration chain závislosti: `apps/kajovo-hotel-api/scripts/init_e2e_smoke_db.py`.
- Doplněn Vite dev proxy `/api -> 127.0.0.1:8000` pro admin i portal app:
  - `apps/kajovo-hotel-admin/vite.config.ts`
  - `apps/kajovo-hotel-web/vite.config.ts`
- Přidán root script `ci:e2e-smoke` do `package.json`.
- Rozšířen CI workflow (`.github/workflows/ci-gates.yml`) o job `e2e-smoke` (setup browseru + 3 po sobě jdoucí běhy smoke).

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm install --frozen-lockfile=false`
- FAIL (env proxy blokuje PyPI): `python -m pip install -e ./apps/kajovo-hotel-api[dev]`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- FAIL (lokální env limit / runner process orchestrace): `pnpm --filter @kajovo/kajovo-hotel-web exec playwright install --with-deps chromium`
- FAIL (lokální env limit / orchestrace nedokončila běh v tomto runneru): `pnpm ci:e2e-smoke`

## E) Rizika / known limits
- V tomto běhovém prostředí je blokovaný apt/pypi proxy (HTTP 403), takže nelze lokálně potvrdit browser deps provisioning přes `--with-deps`.
- CI workflow je navržen tak, aby provisioning proběhl v GitHub runneru; lokální sandbox nemá stejné síťové podmínky.
- Lokální smoke běh zůstal neuzavřený kvůli omezení prostředí; determinismus 3x po sobě je implementován přímo v CI jobu smyčkou.

## F) Handoff pro další prompt
- Po merge ověřit běh `e2e-smoke` jobu v GitHub Actions na PR branch.
- Pokud by v GH runneru byl flake, přidat detailní Playwright traces upload (`actions/upload-artifact`) a případně zvýšit pouze `webServer.timeout` pro API boot.
- Zvážit oddělení smoke suite do samostatného workflow triggeru (`workflow_dispatch`) pro rychlejší rerun diagnózu bez full CI.

## Flake notes
- Stabilizační prvky:
  - fixní porty (`8000`, `4173`, `4174`)
  - `workers: 1`
  - `fullyParallel: false`
  - `retries: 1`
  - čistý DB reset před každým během (`rm -f data/e2e-smoke.sqlite3`)
- CI `e2e-smoke` job běží smoke třikrát po sobě v jedné pipeline (`for run in 1 2 3`).
