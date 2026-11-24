"""Signed CML consent page for the separate Hotel OAuth connection."""

import json
import re

from starlette.concurrency import run_in_threadpool
from starlette.responses import HTMLResponse, JSONResponse, Response

from app.security.hotel_oauth import HotelOAuth

PAGE = """<!doctype html>
<html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Připojit KájovoHotel</title>
<link rel="stylesheet" href="/sections/hotel/ui.css"></head>
<body><main class="panel hotel-oauth-consent"><h1>Připojit KájovoHotel</h1>
<p id="requested-scope"></p>
<button type="button" class="primary" id="connect" disabled>Povolit připojení</button>
<p id="status" role="status"></p>
<script src="/sections/hotel/mcp-consent.js" defer></script></main></body></html>"""
HEADERS = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}


async def consent(
    provider: HotelOAuth,
    method: str,
    query: str,
    media_type: str,
    body: bytes,
    subject: str,
) -> Response:
    if method == "GET" and not query:
        return HTMLResponse(PAGE, headers=HEADERS)
    if method != "POST" or query:
        return JSONResponse({"error": "method_denied"}, status_code=405, headers=HEADERS)
    try:
        if len(body) > 4096 or media_type != "application/json":
            raise ValueError("invalid_ticket")
        payload = json.loads(body)
        if (
            not isinstance(payload, dict)
            or set(payload) != {"ticket", "action"}
            or not isinstance(payload["ticket"], str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{43}", payload["ticket"])
        ):
            raise ValueError("invalid_ticket")
        if payload["action"] == "inspect":
            scopes = await run_in_threadpool(provider.pending_scopes, payload["ticket"])
            result = {"scopes": scopes}
        elif payload["action"] == "approve":
            redirect = await run_in_threadpool(provider.approve, payload["ticket"], subject)
            result = {"redirect": redirect}
        else:
            raise ValueError("invalid_ticket")
        return JSONResponse(result, headers=HEADERS)
    except (PermissionError, ValueError):
        return JSONResponse({"error": "hotel_oauth_denied"}, status_code=400, headers=HEADERS)
