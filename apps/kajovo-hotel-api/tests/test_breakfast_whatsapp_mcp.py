import asyncio
import json
import socket
import threading
import time
from uuid import uuid4

import pytest
import uvicorn
from mcp.server.fastmcp import FastMCP

from app.services.breakfast import whatsapp_client


@pytest.fixture
def mcp_provider(monkeypatch):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = FastMCP("KajovoKomunikace-MCP-Ai-Agent", stateless_http=True, json_response=True)
    sent = []
    receipts = {}
    def result(data):
        return {"contract_version": "komunikace/1.0", "ok": True, "data": data, "error": None}

    @server.tool(structured_output=True)
    def whatsapp_connector_status(recipient: str) -> dict[str, object]:
        return result({"ready": True, "mode": "template", "error_code": None, "read_only": True})

    @server.tool(structured_output=True)
    def whatsapp_send_message(operation_id: str, recipient: str, text: str) -> dict[str, object]:
        sent.append((operation_id, recipient, text))
        receipts[operation_id] = {"id": operation_id, "state": "accepted", "provider_message_id": "synthetic-id"}
        return result(receipts[operation_id])

    @server.tool(structured_output=True)
    def whatsapp_message_status(notification_id: str) -> dict[str, object]:
        return result(receipts[notification_id])

    web = uvicorn.Server(uvicorn.Config(server.streamable_http_app(), host="127.0.0.1", port=port, log_level="critical"))
    thread = threading.Thread(target=web.run, daemon=True)
    thread.start()
    for _ in range(100):
        if web.started:
            break
        time.sleep(0.02)
    assert web.started
    monkeypatch.setattr(whatsapp_client, "load_config", lambda: {"endpoint": f"http://127.0.0.1:{port}/mcp", "token": "synthetic-test-key"})
    yield sent, receipts
    web.should_exit = True
    thread.join(timeout=5)
    assert not thread.is_alive()


def test_real_sdk_discovery_and_receipt_readback(mcp_provider):
    sent, receipts = mcp_provider
    async def exercise():
        client = whatsapp_client.NotificationClient()
        ready = await client.readiness("+420111222333")
        assert ready["ready"] and ready["mode"] == "template"
        ident = str(uuid4())
        reply = await client.send(ident, "+420111222333", "synthetic summary")
        assert reply["state"] == "accepted"
        receipts[ident]["state"] = "delivered"
        assert (await client.status(ident))["state"] == "delivered"
        with pytest.raises(whatsapp_client.NotificationUnavailable):
            await client.call("reply_send", {})
    asyncio.run(exercise())
    assert len(sent) == 1


@pytest.mark.parametrize("change", [
    {"endpoint": "http://example.test/mcp"},
    {"endpoint": "https://example.test/mcp?token=secret"},
    {"endpoint": "https://user:secret@example.test/mcp"},
    {"expires_at": "2020-01-01T00:00:00+00:00"},
    {"token": "short"},
    {"profile": "foreign-profile"},
])
def test_config_fails_closed_without_exposing_secrets(tmp_path, monkeypatch, change):
    path = tmp_path / "client.json"
    path.write_text(json.dumps({"profile": "kajovo-breakfast-whatsapp/1", "endpoint": "https://example.test/mcp",
                                "token": "synthetic_token_for_test_only_123456789", "expires_at": "2030-01-01T00:00:00+00:00", **change}))
    monkeypatch.setattr(whatsapp_client, "get_settings", lambda: type("Config", (), {"breakfast_whatsapp_config_path": str(path)})())
    with pytest.raises(whatsapp_client.NotificationUnavailable, match="^WHATSAPP_CONFIGURATION_REQUIRED$"):
        whatsapp_client.load_config()


def test_missing_config_is_not_configured(tmp_path, monkeypatch):
    monkeypatch.setattr(whatsapp_client, "get_settings", lambda: type("Config", (), {"breakfast_whatsapp_config_path": str(tmp_path / "absent")})())
    assert whatsapp_client.configured() is False
