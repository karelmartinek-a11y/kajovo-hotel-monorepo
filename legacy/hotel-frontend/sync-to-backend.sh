#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="${1:-../hotel-backend}"

if [ ! -d "$BACKEND_DIR/app/web" ]; then
  echo "ERROR: Backend dir must contain app/web. Got: $BACKEND_DIR" >&2
  exit 1
fi

# Update frontend-version.json if we're in a git checkout
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)"
  if [ -n "$COMMIT" ]; then
    printf '{\n  "frontend_commit": "%s"\n}\n' "$COMMIT" > static/frontend-version.json
  fi
fi

rsync -a --delete static/ "$BACKEND_DIR/app/web/static/"
rsync -a --delete templates/ "$BACKEND_DIR/app/web/templates/"

# Optional convenience copies (not used by templates directly, but kept consistent)
for f in hotel-webapp.css hotel-webapp.js public_landing.html web_app.html web_app_landing.html; do
  if [ -f "$f" ] && [ -d "$BACKEND_DIR/app/web" ]; then
    cp -f "$f" "$BACKEND_DIR/app/web/$f"
  fi
done

echo "OK: Synced templates + static into $BACKEND_DIR/app/web"
