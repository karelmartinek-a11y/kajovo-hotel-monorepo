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
- PASS: `pnpm ci:verification-doc`
- PASS: `pnpm install --frozen-lockfile=false`
- FAIL (env proxy blokuje PyPI): `python -m pip install -e ./apps/kajovo-hotel-api[dev]`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- FAIL (lokální env limit / runner process orchestrace): `pnpm --filter @kajovo/kajovo-hotel-web exec playwright install --with-deps chromium`
- FAIL (lokální env limit / orchestrace nedokončila běh v tomto runneru): `pnpm ci:e2e-smoke`

## E) Rizika/known limits
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


---

# Prompt 13b – CI smoke webServer timeout fix

## A) Cíl
- Opravit timeout `config.webServer` v `ci:e2e-smoke` tak, aby Playwright čekal na správné readiness URL a používal stabilní cwd per service.

## B) Exit criteria
- `apps/kajovo-hotel-web/tests/e2e-smoke.config.ts` používá robustní workspace resolution přes `git rev-parse --show-toplevel` uvnitř každého webServer commandu.
- Každý service entry používá `url` readiness check (API `/health`, admin/portal `/`) místo obecného `port` waitu.
- Timeout budget je zvýšen pro pomalejší GH cold start.

## C) Změny
- Upravena orchestrace v `apps/kajovo-hotel-web/tests/e2e-smoke.config.ts`:
  - API service: shell command dopočítá repo root přes `git rev-parse --show-toplevel` a startuje API z `apps/kajovo-hotel-api`, readiness `http://127.0.0.1:8000/health`.
  - Admin service: shell command startuje admin Vite z `apps/kajovo-hotel-admin`, readiness `http://127.0.0.1:4173/`.
  - Portal service: shell command startuje portal Vite z `apps/kajovo-hotel-web`, readiness `http://127.0.0.1:4174/`.
  - timeout navýšen na `180_000` pro všechny služby.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm ci:verification-doc`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- FAIL (env proxy blokuje browser dependencies): `pnpm --filter @kajovo/kajovo-hotel-web exec playwright install --with-deps chromium`
- FAIL (env limit navazující na browser deps): `pnpm ci:e2e-smoke`

## E) Rizika/known limits
- Lokální runner má síťové omezení (apt proxy 403), které blokuje Playwright browser provisioning; e2e smoke nelze plně dokončit lokálně.
- Finální potvrzení determinismu je v GitHub Actions runneru.

## F) Handoff pro další prompt
- Po merge zkontrolovat `e2e-smoke` job; očekávané zlepšení: odstranění timeoutu `config.webServer` díky URL readiness + delším timeoutům.
- Pokud by timeout přetrval, přidat startup log artifact upload pro každý webServer proces.


---

# Prompt 13c – CI smoke webServer startup mode fix

## A) Cíl
- Odstranit timeout `config.webServer` způsobený nestabilním startem Vite dev serverů v CI orchestrace.

## B) Exit criteria
- Smoke config startuje admin/portal přes `pnpm build` + `pnpm exec vite preview` místo `dev` režimu.
- Readiness pro admin/portal je explicitní URL (`/`) a timeout budget je navýšený pro build cold-start.
- API orchestrace i auth smoke scénáře zůstávají beze změny funkcionality.

## C) Změny
- `apps/kajovo-hotel-web/tests/e2e-smoke.config.ts`:
  - admin webServer command změněn na `corepack pnpm build` + `corepack pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort` (spuštěno z `apps/kajovo-hotel-admin`)
  - portal webServer command změněn na `corepack pnpm build` + `corepack pnpm exec vite preview --host 127.0.0.1 --port 4174 --strictPort` (spuštěno z `apps/kajovo-hotel-web`)
  - timeout pro admin/portal webServer navýšen na `300_000`
  - zachována repo-root rezoluce přes `git rev-parse --show-toplevel`

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm ci:verification-doc`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- FAIL (lokální env/browser procesy): `pnpm ci:e2e-smoke`

## E) Rizika/known limits
- Lokální sandbox má omezení pro stabilní browser/e2e běh; definitivní verifikace timeout fixu je v GitHub Actions runneru.
- `build + preview` je pomalejší než `dev`; proto je navýšen timeout budget v smoke configu.

## F) Handoff pro další prompt
- Po merge zkontrolovat `e2e-smoke` job zejména během `run 1/3`; očekávané je odstranění `Timed out waiting ... from config.webServer`.
- Pokud by timeout přetrval, přidat krokový log marker před/po `build` a `preview` commandech jako artifact.


---

# Prompt 13d – CI smoke prebuild + preview-only webServer fix

## A) Cíl
- Opravit timeout v CI e2e-smoke odstraněním build contention uvnitř paralelních Playwright `webServer` procesů.

## B) Exit criteria
- CI `e2e-smoke` job dělá prebuild admin+portal před spuštěním smoke loop.
- `e2e-smoke.config.ts` startuje admin/portal pouze přes `vite preview` (bez `pnpm build` uvnitř webServer commandu).
- Deterministic smoke loop (`run 1/3` až `run 3/3`) zůstává beze změny.

## C) Změny
- `.github/workflows/ci-gates.yml`:
  - přidán krok `Prebuild admin + portal for smoke preview` před `Run deterministic smoke x3`.
- `apps/kajovo-hotel-web/tests/e2e-smoke.config.ts`:
  - admin/portal webServer commandy upraveny na preview-only režim (`corepack pnpm exec vite preview ...`).
  - API orchestrace i readiness URL beze změny.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `pnpm ci:verification-doc`
- PASS: `pnpm lint`
- PASS: `pnpm typecheck`
- PASS: `pnpm unit`
- FAIL (lokální env limit pro browser/e2e): `pnpm ci:e2e-smoke`

## E) Rizika/known limits
- Lokální prostředí stále neumožňuje plnou e2e validaci; fix cílí na CI race/timeout pattern z GH runneru.
- Prebuild zvyšuje délku běhu jobu, ale snižuje riziko timeoutu při startu `webServer`.

## F) Handoff pro další prompt
- Po merge potvrdit běh CI na problematickém jobu/steppu (`Run deterministic smoke x3`).
- Pokud by timeout přetrval, doplnit artifact upload z Playwright webServer stdout/stderr pro admin/portal preview procesy.
