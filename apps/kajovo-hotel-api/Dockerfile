FROM python:3.11.11-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/constraints.txt /opt/requirements/constraints.txt
COPY packages/voice-core-server /opt/voice-core-server
COPY apps/kajovo-hotel-api/pyproject.toml /opt/hotel-api/pyproject.toml
RUN pip install --no-cache-dir -c /opt/requirements/constraints.txt /opt/voice-core-server \
    && python -c "import pathlib, tomllib; p=tomllib.loads(pathlib.Path('/opt/hotel-api/pyproject.toml').read_text()); pathlib.Path('/tmp/runtime-requirements.txt').write_text(chr(10).join(p['project']['dependencies']))" \
    && pip install --no-cache-dir -c /opt/requirements/constraints.txt -r /tmp/runtime-requirements.txt

COPY apps/kajovo-hotel-api/app /app/app
COPY apps/kajovo-hotel-api/alembic /app/alembic
COPY apps/kajovo-hotel-api/alembic.ini /app/alembic.ini
COPY android/release /app/android/release

RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["sh", "-c", "if [ \"${KAJOVO_API_SKIP_MIGRATIONS:-0}\" != \"1\" ]; then alembic upgrade head; fi; uvicorn app.main:app --host 0.0.0.0 --port 8000"]
