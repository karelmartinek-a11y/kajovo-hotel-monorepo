# Jak spustit Kájovo Hotel lokálně

## Aktivní části

- `apps/kajovo-hotel-web` – provozní portál
- `apps/kajovo-hotel-admin` – administrace
- `apps/kajovo-hotel-api` – backend

## Základní postup

1. Nainstalujte JavaScript závislosti podle lockfilu:
   - `pnpm install --frozen-lockfile`
2. Nainstalujte API závislosti:
   - `python3.11 -m pip install -e ./apps/kajovo-hotel-api[dev]`
3. Spusťte API:
   - `uvicorn app.main:app --reload --app-dir apps/kajovo-hotel-api --port 8000`
4. Spusťte portál:
   - `pnpm --filter @kajovo/kajovo-hotel-web dev`
5. Spusťte administraci:
   - `pnpm --filter @kajovo/kajovo-hotel-admin dev`

## Rozsah lokálního běhu

Lokální běh kryje pouze `apps/kajovo-hotel-web`, `apps/kajovo-hotel-admin` a `apps/kajovo-hotel-api` nad stejným RBAC a OpenAPI kontraktem.
