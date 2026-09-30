import asyncio
import json

import httpx

from app.config import get_settings
from app.services.smart_technologies import SmartArguments, SmartResult, VoiceToolCall, execute_tool
from tests.test_voice_core import KEY
from tests.test_voice_core import voice_host as voice_host

BASE = "/api/v1/admin/voice-core"
SEARCH = {"name": "smart_technologies", "call_id": "call_search", "arguments": {"operation": "search", "location": "Recepce"}}


def test_tool_requires_admin_and_csrf(voice_host, monkeypatch):
    client, _, login = voice_host
    calls = []
    async def execute(payload, session_id):
        calls.append((payload, session_id))
        return SmartResult(status="ok")
    monkeypatch.setattr("app.api.routes.voice_core.execute_tool", execute)
    assert client.post(BASE + "/tools", json=SEARCH).status_code == 401
    login("portal", "recepce")
    assert client.post(BASE + "/tools", json=SEARCH).status_code == 403
    login()
    client.headers.pop("x-csrf-token")
    assert client.post(BASE + "/tools", json=SEARCH).status_code == 403
    client.headers["x-csrf-token"] = "test-csrf"
    assert client.post(BASE + "/tools", json=SEARCH).status_code == 200
    assert len(calls) == 1 and calls[0][1]


def test_tool_validation_does_not_echo_data(voice_host):
    client, _, login = voice_host
    login()
    for body in [{**SEARCH, "name": "arbitrary_service"}, {**SEARCH, "arguments": {"operation": "execute", "query": KEY}},
                 {**SEARCH, "arguments": {"operation": "search", "request_id": KEY}}]:
        response = client.post(BASE + "/tools", json=body)
        assert response.status_code == 422 and KEY not in response.text
    assert client.post(BASE + "/tools", json=SEARCH).status_code == 503


def test_session_registers_exactly_one_host_tool(voice_host, monkeypatch):
    client, _, login = voice_host
    login()
    monkeypatch.setattr(get_settings(), "smart_technologies_url", "https://ha-inventory.hcasc.cz/v1/smart-technologies")
    monkeypatch.setattr(get_settings(), "smart_technologies_token", "test-smart-secret")
    client.put(BASE + "/api-key", json={"api_key": KEY})
    calls = []
    async def create(self, sdp, config, key):
        calls.append(self)
        return "v=0\r\nanswer", "gpt-realtime-2.1"
    monkeypatch.setattr("app.api.routes.voice_core.RealtimeSessionClient.create", create)
    assert client.post(BASE + "/sessions", json={"sdp": "v=0\r\noffer", "revision": 1}).status_code == 200
    assert [tool["name"] for tool in calls[0].tools] == ["smart_technologies"]
    assert "request_id" not in calls[0].tools[0]["parameters"]["properties"]
    assert "same type may differ" in calls[0].tool_instructions


def test_upstream_server_secret_and_session_scoped_receipts(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "smart_technologies_url", "https://ha-inventory.hcasc.cz/v1/smart-technologies")
    monkeypatch.setattr(settings, "smart_technologies_token", "test-smart-secret")
    requests = []
    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"status": "accepted", "devices": [], "total_count": 0})
    call = VoiceToolCall(name="smart_technologies", call_id="call_execute", arguments=SmartArguments(operation="execute",
        device_key="dev_test", property_key="power", state_key="off", catalog_version="sha256:test"))
    transport = httpx.MockTransport(respond)
    first = asyncio.run(execute_tool(call, "session-one", transport))
    asyncio.run(execute_tool(call, "session-one", transport))
    asyncio.run(execute_tool(call, "session-two", transport))
    ids = [json.loads(r.content)["request_id"] for r in requests]
    assert ids[0] == ids[1] and ids[0] != ids[2]
    assert requests[0].headers["authorization"] == "Bearer test-smart-secret"
    assert "test-smart-secret" not in first.model_dump_json()


def test_action_timeout_is_unknown_and_has_no_transport_retry(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "smart_technologies_url", "https://ha-inventory.hcasc.cz/v1/smart-technologies")
    monkeypatch.setattr(settings, "smart_technologies_token", "test-smart-secret")
    calls = []
    def respond(request):
        calls.append(request)
        raise httpx.ReadTimeout("SECRET", request=request)
    call = VoiceToolCall(name="smart_technologies", call_id="call_execute", arguments=SmartArguments(operation="execute",
        device_key="dev_test", property_key="power", state_key="off", catalog_version="sha256:test"))
    result = asyncio.run(execute_tool(call, "session-one", httpx.MockTransport(respond)))
    assert result.status == "unknown" and len(calls) == 1
    assert "SECRET" not in result.model_dump_json()
