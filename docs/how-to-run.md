# How to run (developer)

## API
From repo root:

- Docker:
  - `docker compose -f infra/dev-compose.yml up --build`
  - API health: `GET http://localhost:8000/health`

- Python:
  - `cd apps/kajovo-hotel-api`
  - `python -m pip install -e .` (or install dependencies manually)
  - `uvicorn app.main:app --reload`

## Web
From repo root:
- `cd apps/kajovo-hotel-web`
- `npm install`
- `npm run dev`

Note: The UI/branding compliance gates and full refactor are intended to be implemented via Codex.
