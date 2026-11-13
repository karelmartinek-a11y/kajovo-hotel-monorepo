"""One-click warehouse orders through the dedicated Mail MCP grant."""
import asyncio
import hashlib
import json
import os
import re
import stat
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

PRAGUE = ZoneInfo("Europe/Prague")
FROM = "provoz@hotelchodovasc.cz"
SUBJECT = "Objednávka vajec – Hotel CHODOV ASC"
CONFIG = Path("/app/data/credentials/egg-orders.json")


def delivery_date(now: datetime) -> date:
    local = now.astimezone(PRAGUE)
    result = local.date() + timedelta(days=1 if local.time() <= time(18) else 2)
    return result + timedelta(days=1) if result.weekday() == 6 else result


def mail_config() -> dict:
    fd = os.open(CONFIG, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_size > 4096:
            raise ValueError("Invalid egg order configuration")
        config = json.load(stream)
    if (not re.fullmatch(r"https://kajovomail-mcp\.hcasc\.cz/mcp/access/[a-f0-9-]{36}", config["endpoint"])
            or not re.fullmatch(r"[A-Za-z0-9_-]{43}", config["token"])
            or not re.fullmatch(r"[^\s<>@]+@[^\s<>@]+", config["recipient"])):
        raise ValueError("Invalid egg order configuration")
    return config


def send_request(order, recipient: str, now: datetime) -> dict:
    frozen = {
        "version": 1, "account": "provoz", "expected_from": FROM,
        "to": [recipient], "cc": [], "bcc": [], "subject": SUBJECT, "attachments": [],
        "text": (
            "Dobrý den,\n\n"
            f"objednávám 180 vajec pro Hotel CHODOV ASC na {order.delivery_date:%d. %m. %Y}.\n\n"
            "Děkuji a prosím o potvrzení termínu dodání.\n\nHotel CHODOV ASC"
        ),
    }
    digest = hashlib.sha256(json.dumps(
        frozen, sort_keys=True, ensure_ascii=False, separators=(",", ":"),
    ).encode()).hexdigest()
    return {
        **frozen, "kind": "send", "send_intent_id": order.id, "idempotency_key": order.id,
        "confirmed": True, "content_hash": digest,
        "approval_expires_at": (now + timedelta(minutes=5)).isoformat(),
    }


async def call_mail(config: dict, request: dict) -> dict:
    async with asyncio.timeout(65):
        async with streamablehttp_client(
            config["endpoint"], headers={"Authorization": "Bearer " + config["token"]},
            timeout=45, sse_read_timeout=55,
        ) as (reader, writer, _):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                result = await session.call_tool("mail_send_message", {"request": request})
    body = result.structuredContent
    if not isinstance(body, dict):
        body = json.loads(next(part.text for part in result.content if part.type == "text"))
    if body.get("contract_version") != "mail-service-send/1":
        raise ValueError("Invalid Mail response")
    return body


def read_result(order, body: dict, *, sending: bool) -> tuple[str, str | None]:
    receipt = body.get("receipt")
    if isinstance(receipt, dict):
        operation = receipt.get("operation_id")
        if (receipt.get("send_intent_id") == receipt.get("idempotency_key") == order.id
                and receipt.get("content_hash") == order.content_hash
                and isinstance(operation, str) and len(operation) == 36):
            if (receipt.get("smtp_state") == "accepted"
                    and receipt.get("accepted_recipient_addresses") == [order.recipient]):
                return "sent", operation
            if receipt.get("smtp_state") == "rejected":
                return "rejected", operation
    if sending and body.get("status") == "error" and not receipt:
        errors = body.get("errors") or []
        if errors and errors[0].get("code") in {
            "SERVICE_SENDER_FORBIDDEN", "SENDER_CONFIGURATION_CHANGED",
            "SERVICE_APPROVAL_EXPIRED", "INVALID_CONTENT_HASH",
        }:
            return "rejected", None
    return "unknown", None
