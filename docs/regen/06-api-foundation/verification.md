# Prompt 06 – API foundation completion verification

## A) Cíl
- Uzavřít API foundation evidencí pro health/readiness endpointy (`/health`, `/ready`, `/api/health`), jednotný error envelope a request-id/audit základ.
- Rozšířit unit testy o pokrytí health aliasu a error envelope.
- Zapsat auditovatelnou verifikaci do `docs/regen` + parity mapy.

## B) Exit criteria
- Health/readiness endpointy vrací konzistentní payload včetně `request_id`.
- API vrací jednotný error model (`error.code`, `error.message`, `error.request_id`, `error.details`) při HTTP/CSRF/validation chybách.
- Request-id je vracen v odpovědi i uvnitř error envelope.
- Testy pro health/ready + error envelope prochází.
- Parity mapa obsahuje explicitní záznam pro API foundation prompt 06.

## C) Změny
- `app/api/routes/health.py`
  - Přidán alias endpoint `GET /api/health`.
  - `GET /health` a `GET /ready` nyní vrací i `request_id` z request contextu.
- `app/main.py`
  - Přidán jednotný helper `_error_response(...)`.
  - Přidány globální handlers pro `HTTPException` a `RequestValidationError`.
  - CSRF middleware vrací stejný error envelope jako ostatní API chyby.
  - Zachována zpětná kompatibilita přes top-level `detail`.
- `tests/test_health.py`
  - Rozšířeny testy pro `/health`, nový `/api/health`, `/ready` a envelope při 404 chybě.
- `docs/regen/parity/parity-map.yaml`
  - Přidán modulový záznam `api_foundation_prompt_06` se stavem `DONE`.

## D) Ověření (přesné příkazy + PASS/FAIL)
- PASS: `python -m pytest apps/kajovo-hotel-api/tests/test_health.py`
- PASS: `python -m pytest apps/kajovo-hotel-api/tests`
- PASS: `ruff check apps/kajovo-hotel-api/app apps/kajovo-hotel-api/tests`
- FAIL (environment): `pnpm typecheck`
  - Důvod: v prostředí chybí `node_modules` / frontend závislosti (`react`, `@playwright/test`, atd.), takže TypeScript lint pro web/admin není spustitelný bez instalace dependencies.

## E) Rizika / known limits
- Top-level `detail` je zatím zachováno kvůli kompatibilitě starších klientů; při budoucím hard cutu bude potřeba migration notice.
- `pnpm typecheck` je v tomto běhu blokovaný chybějícími frontend dependencies v prostředí runneru.

## F) Handoff pro další prompt
- Pokud bude navazovat API kontrakt prompt, doporučeno exportovat OpenAPI (`pnpm api:generate-contract`) a rozhodnout, zda do schématu explicitně zapsat jednotný error envelope jako sdílený response model.
- Pro úplné quality gates v CI doplnit instalaci JS závislostí před `pnpm typecheck`.
