# Kájovo Hotel API

FastAPI backend pro web, admin a Android klienta.

## Aktivní endpointové skupiny

- `/api/auth`
- `/api/app/android-release`
- `/api/v1/breakfast`
- `/api/v1/device`
- `/api/v1/issues`
- `/api/v1/inventory`
- `/api/v1/lost-found`
- `/api/v1/reports`
- `/api/v1/users`
- `/api/v1/admin/settings`
- `/api/v1/admin/profile`
- `/health`, `/api/health`, `/ready`

## Příkazy

```bash
python -m pip install -e .[dev]
uvicorn app.main:app --reload --port 8000
python -m pytest tests
python -m ruff check app tests
```
