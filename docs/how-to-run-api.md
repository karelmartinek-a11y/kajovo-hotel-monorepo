# Jak spustit API

Detail k obecnému spuštění je v `docs/how-to-run.md`. Tento dokument drží jen API specifika.

## Instalace

```bash
python3.11 -m pip install ./packages/voice-core-server
cd apps/kajovo-hotel-api
python3.11 -m pip install -e .[dev]
```

## Migrace databáze

```bash
cd apps/kajovo-hotel-api
alembic upgrade head
```

Volitelně s vlastní databází:

```bash
export KAJOVO_API_DATABASE_URL='sqlite:///./kajovo_hotel.db'
alembic upgrade head
```

## Start API

```bash
cd apps/kajovo-hotel-api
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Ověření

```bash
curl -fsS http://127.0.0.1:8000/health
curl -fsS http://127.0.0.1:8000/ready
```

Pro hlasový produkt nastavte `KAJOVO_API_VOICE_MASTER_KEY` podle [Voice Core](voice-core.md). Bez něj běžné API funguje, ale ukládání OpenAI klíče a hlasové session jsou odmítnuty.
