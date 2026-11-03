"""Scoped service-to-service MCP client; provider secrets stay in Komunikace."""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from app.config import get_settings
from app.time_utils import utc_now

TOOLS = frozenset({"whatsapp_send_message", "whatsapp_message_status", "whatsapp_connector_status"})
DELIVERY_STATES = frozenset({"pending", "blocked", "submitting", "accepted", "delivered", "read", "failed", "unknown"})


class NotificationUnavailable(Exception):
    def __init__(self, code="WHATSAPP_UNAVAILABLE"):
        self.code = code if re.fullmatch(r"[A-Z0-9_]{1,80}", str(code)) else "WHATSAPP_UNAVAILABLE"
        super().__init__(self.code)


def load_config():
    try:
        path = Path(get_settings().breakfast_whatsapp_config_path)
        if path.stat().st_size > 8192:
            raise ValueError()
        config = json.loads(path.read_text())
        url = urlsplit(config["endpoint"])
        expires = datetime.fromisoformat(config["expires_at"])
        if (config["profile"] != "kajovo-breakfast-whatsapp/1"
                or url.scheme != "https" or not url.hostname or url.username or url.password
                or url.port or url.query or url.fragment or url.path != "/mcp"
                or not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", config["token"])
                or expires.tzinfo is None or expires <= utc_now()):
            raise ValueError()
        return config
    except (OSError, ValueError, KeyError, TypeError):
        raise NotificationUnavailable("WHATSAPP_CONFIGURATION_REQUIRED") from None


def configured() -> bool:
    try:
        load_config()
        return True
    except NotificationUnavailable:
        return False


class NotificationClient:
    async def call(self, name, arguments):
        if name not in TOOLS:
            raise NotificationUnavailable("WHATSAPP_TOOL_DENIED")
        config = load_config()
        try:
            async with httpx.AsyncClient(
                headers={"Authorization": "Bearer " + config["token"]},
                timeout=httpx.Timeout(20), follow_redirects=False,
            ) as http:
                async with streamable_http_client(config["endpoint"], http_client=http) as (reader, writer, _):
                    async with ClientSession(reader, writer, read_timeout_seconds=timedelta(seconds=25)) as session:
                        identity = await session.initialize()
                        if identity.serverInfo.name != "KajovoKomunikace-MCP-Ai-Agent":
                            raise NotificationUnavailable("WHATSAPP_TARGET_MISMATCH")
                        catalog = await session.list_tools()
                        if catalog.nextCursor or {tool.name for tool in catalog.tools} != TOOLS:
                            raise NotificationUnavailable("WHATSAPP_GRANT_MISMATCH")
                        result = await session.call_tool(name, arguments)
                        payload = result.structuredContent
                        if not isinstance(payload, dict) or payload.get("contract_version") != "komunikace/1.0":
                            raise NotificationUnavailable("WHATSAPP_CONTRACT_INVALID")
                        if result.isError or payload.get("ok") is not True:
                            raise NotificationUnavailable((payload.get("error") or {}).get("code"))
                        data = payload.get("data")
                        if not isinstance(data, dict):
                            raise NotificationUnavailable("WHATSAPP_CONTRACT_INVALID")
                        if name != "whatsapp_connector_status":
                            expected = arguments.get("notification_id", arguments.get("operation_id"))
                            if data.get("id") != expected or data.get("state") not in DELIVERY_STATES:
                                raise NotificationUnavailable("WHATSAPP_RECEIPT_INVALID")
                        return data
        except NotificationUnavailable:
            raise
        except Exception as exc:
            # Exceptions may contain HTTP headers or provider payloads. Do not log them.
            pending = list(getattr(exc, "exceptions", []))
            while pending:
                nested = pending.pop()
                if isinstance(nested, NotificationUnavailable):
                    raise NotificationUnavailable(nested.code) from None
                pending.extend(getattr(nested, "exceptions", []))
            raise NotificationUnavailable() from None

    async def readiness(self, recipient):
        return await self.call("whatsapp_connector_status", {"recipient": recipient})

    async def send(self, operation_id, recipient, text):
        return await self.call("whatsapp_send_message", {
            "operation_id": operation_id, "recipient": recipient, "text": text,
        })

    async def status(self, operation_id):
        return await self.call("whatsapp_message_status", {"notification_id": operation_id})
