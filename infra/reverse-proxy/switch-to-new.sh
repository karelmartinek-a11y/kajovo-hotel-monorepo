#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_SITE_PATH="${NGINX_SITE_PATH:-/etc/nginx/conf.d/kajovohotel.conf}"
NGINX_TEST_CMD="${NGINX_TEST_CMD:-nginx -t}"
NGINX_RELOAD_CMD="${NGINX_RELOAD_CMD:-systemctl reload nginx}"

cp "$SCRIPT_DIR/production-new.conf" "$NGINX_SITE_PATH"
$NGINX_TEST_CMD
$NGINX_RELOAD_CMD

echo "Switched production hostname to NEW stack using $NGINX_SITE_PATH"
