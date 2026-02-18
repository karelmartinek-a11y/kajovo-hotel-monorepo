# How to run `kajovo-hotel-api`

## 1) Install dependencies

```bash
cd apps/kajovo-hotel-api
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

## 2) Run database migrations

```bash
cd apps/kajovo-hotel-api
alembic upgrade head
```

To use a custom database URL:

```bash
export KAJOVO_API_DATABASE_URL='sqlite:///./kajovo_hotel.db'
alembic upgrade head
```

## 3) Run API server

```bash
cd apps/kajovo-hotel-api
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 4) Run tests and lint

```bash
cd apps/kajovo-hotel-api
ruff check .
pytest -q
```

## 5) Quick endpoint checks

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/v1/reports
```
