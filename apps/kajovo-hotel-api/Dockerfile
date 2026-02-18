FROM python:3.11.11-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    fastapi==0.115.14 \
    "uvicorn[standard]==0.30.6" \
    sqlalchemy==2.0.44 \
    alembic==1.17.1 \
    pydantic-settings==2.11.0 \
    "psycopg[binary]==3.2.13"

COPY app /app/app
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini

RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["sh", "-c", "if [ \"${KAJOVO_API_SKIP_MIGRATIONS:-0}\" != \"1\" ]; then alembic upgrade head; fi; uvicorn app.main:app --host 0.0.0.0 --port 8000"]
