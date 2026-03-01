# How to run (developer)

## Požadavky

- Node.js 20+
- pnpm 9+
- Python 3.11+

## 1) Instalace závislostí

```bash
cd <repo-root>
pnpm install
```

## 2) API

```bash
cd apps/kajovo-hotel-api
python -m pip install -e .[dev]
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl -fsS http://127.0.0.1:8000/health
```

## 3) Admin frontend

```bash
cd apps/kajovo-hotel-admin
pnpm dev
```

## 4) Portal frontend

```bash
cd apps/kajovo-hotel-web
pnpm dev
```

## 5) Testy a gate kontroly

Z rootu repozitáře:

```bash
pnpm lint
pnpm typecheck
pnpm unit
pnpm ci:gates
```
