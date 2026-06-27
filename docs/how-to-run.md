# Jak spustit Kájovo Hotel lokálně

## Aktivní části

- `apps/kajovo-hotel-web` – provozní portál
- `apps/kajovo-hotel-admin` – administrace
- `apps/kajovo-hotel-api` – backend

## Základní postup

1. Nainstalujte JavaScript závislosti podle lockfilu:
   - `pnpm install --frozen-lockfile`
2. Nainstalujte API závislosti:
   - `python -m pip install -e ./apps/kajovo-hotel-api[dev]`
3. Spusťte API:
   - `uvicorn app.main:app --reload --app-dir apps/kajovo-hotel-api --port 8000`
4. Spusťte portál:
   - `pnpm --filter @kajovo/kajovo-hotel-web dev`
5. Spusťte administraci:
   - `pnpm --filter @kajovo/kajovo-hotel-admin dev`

## Poznámka k Androidu

Legacy Android aplikace byla z tohoto repozitáře vyřazena. Lokální spuštění ani webový deploy se na Android build, APK ani signing již nevážou.
