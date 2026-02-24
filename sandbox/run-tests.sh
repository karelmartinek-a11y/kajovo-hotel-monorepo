#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/kajovo-hotel-monorepo"
API_DIR="$ROOT/apps/kajovo-hotel-api"
VENV_PY="$ROOT/.venv/bin/python3"

if [ ! -d "$ROOT/.git" ]; then
  echo "Repo $ROOT nenalezeno; spusť nejdřív produkční deploy." >&2
  exit 1
fi

cd "$ROOT"

# Minimalni rychly test: API health s SQLite, bez dopadu na produkcni DB.
export PYTHONPATH="$API_DIR"
export KAJOVO_API_DATABASE_URL="sqlite:///apps/kajovo-hotel-api/data/sandbox.sqlite3"
export KAJOVO_API_SMTP_ENABLED="false"
mkdir -p "$API_DIR/data"
rm -f "$API_DIR/data/sandbox.sqlite3"

export PATH="$ROOT/.venv/bin:$PATH"

echo "[SANDBOX] pytest apps/kajovo-hotel-api/tests/test_health.py"
"$VENV_PY" -m pytest "$API_DIR/tests/test_health.py"

echo "[SANDBOX] hotovo"
