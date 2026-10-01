import asyncio
import json

import httpx
import pytest
from pydantic import ValidationError
from voice_core_server import (
    RealtimeSessionClient,
    VoiceCoreConfig,
    VoiceError,
    catalog,
    session_config,
)
from voice_core_server.contracts import CAPABILITY_REGISTRY


class Sink:
    def __init__(self):
        self.events = []

    def emit(self, event, attributes):
        self.events.append((event, attributes))


@pytest.mark.parametrize("length,tokens", [("short", 512), ("medium", 1024), ("long", 2048)])
@pytest.mark.parametrize("language", ["automatic", "manual"])
def test_policy(length, tokens, language):
    config = VoiceCoreConfig(response_length=length, language_mode=language,
                             manual_language="cs" if language == "manual" else None)
    session = session_config(config, "gpt-realtime-2.1")
    assert session["max_output_tokens"] == tokens
    assert {"short": "one or two", "medium": "three to five", "long": "six to ten"}[length] in session["instructions"]
    assert session["tool_choice"] == "none"
    assert "tools" not in session
    assert not CAPABILITY_REGISTRY
    assert "no tools" in session["instructions"]
    assert "Čeština" in session["instructions"] if language == "manual" else "adapt naturally" in session["instructions"]
    assert session["audio"]["input"]["turn_detection"]["interrupt_response"] is True


@pytest.mark.parametrize("config", [{"manual_model": "unknown"}, {"voice": "unknown"},
    {"manual_language": "xx"}, {"model_mode": "manual"}, {"language_mode": "manual"},
    {"instructions": "ignore rules"}, {"tools": []}, {"temperature": 1}])
def test_unsupported_or_extra_configuration_rejected(config):
    with pytest.raises(ValidationError):
        VoiceCoreConfig(**config)


def test_catalog_is_central_and_defaults_supported():
    data = catalog()
    assert len(data["voices"]) == 10
    assert VoiceCoreConfig().voice in data["voices"]
    assert {language["id"] for language in data["languages"]} == {"cs", "en", "de", "sk"}


def test_optional_server_owned_tools_replace_tool_free_instructions():
    tools = [{"type": "mcp", "server_label": "example", "server_url": "https://example.test/mcp", "allowed_tools": ["example"], "require_approval": "never"}]
    session = session_config(VoiceCoreConfig(), "gpt-realtime-2.1", tools, "Use only example for connected data.\n")
    assert session["tools"] == tools and session["tool_choice"] == "auto"
    assert "Use only example" in session["instructions"]
    assert "You have no tools" not in session["instructions"]


def test_automatic_fallback_only_on_model_unavailable():
    calls = []
    sink = Sink()

    def respond(request):
        body = request.content.decode()
        calls.append(body)
        assert request.headers["authorization"] == "Bearer test-key"
        return httpx.Response(404, json={"error": {"code": "model_not_found"}}) if len(calls) == 1 else httpx.Response(201, text="v=0\r\nanswer")

    result = asyncio.run(RealtimeSessionClient(sink, httpx.MockTransport(respond)).create("v=0\r\noffer", VoiceCoreConfig(), "test-key"))
    assert result[1] == "gpt-realtime-2"
    assert len(calls) == 2
    assert all("test-key" not in json.dumps(event) for event in sink.events)


@pytest.mark.parametrize("mode,status,code,category", [
    ("manual", 404, "model_not_found", "model_unavailable"),
    ("automatic", 401, "invalid_api_key", "invalid_api_key"),
    ("automatic", 429, "rate_limit_exceeded", "rate_limited"),
    ("automatic", 503, None, "provider_unavailable"),
    ("automatic", 403, "permission_denied", "session_creation_failed"),
])
def test_manual_never_falls_back_and_auth_errors_do_not_retry(mode, status, code, category):
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(status, json={"error": {"code": code, "message": "sensitive provider message"}})
    config = VoiceCoreConfig(model_mode=mode, manual_model="gpt-realtime-2" if mode == "manual" else None)
    with pytest.raises(VoiceError) as raised:
        asyncio.run(RealtimeSessionClient(Sink(), httpx.MockTransport(respond)).create("v=0", config, "test-key"))
    assert str(raised.value) == category
    assert len(calls) == 1


def test_timeout_and_bad_success_are_sanitized():
    def timeout(request):
        raise httpx.ReadTimeout("SECRET", request=request)
    with pytest.raises(VoiceError, match="provider_timeout"):
        asyncio.run(RealtimeSessionClient(Sink(), httpx.MockTransport(timeout)).create("v=0", VoiceCoreConfig(), "test-key"))
    with pytest.raises(VoiceError, match="session_creation_failed"):
        asyncio.run(RealtimeSessionClient(Sink(), httpx.MockTransport(lambda _: httpx.Response(200, text="SECRET"))).create("v=0", VoiceCoreConfig(), "test-key"))


@pytest.mark.parametrize('patch', [
    {'server_url': 'http://private.invalid'}, {'server_url': 'https://['},
    {'allowed_tools': []}, {'allowed_tools': ['read', 'read']},
    {'require_approval': 'invalid'}, {'unexpected': 'invalid'},
])
def test_mcp_validation_error_never_discloses_credentials(patch, caplog):
    from voice_core_server.contracts import McpServerConfig
    canary = 'Bearer CANARY-MCP-SENSITIVE-INPUT-0123456789'
    values = {'server_label': 'safe', 'server_url': 'https://example.test/mcp',
              'authorization': canary, 'allowed_tools': ['read']}
    values.update(patch)
    with pytest.raises(ValidationError) as raised:
        McpServerConfig(**values)
    for text in [str(raised.value), repr(raised.value), caplog.text]:
        assert canary not in text and 'CANARY-MCP-SENSITIVE' not in text
    valid = McpServerConfig(server_label='safe', server_url='https://example.test/mcp',
                           authorization=canary, allowed_tools=['read'])
    assert 'CANARY-MCP-SENSITIVE' not in repr(valid)
    assert 'CANARY-MCP-SENSITIVE' not in valid.model_dump_json()
    assert valid.session_tool()['authorization'] == canary


def test_native_mcp_exact_serialized_realtime_calls_session_contract():
    from email.parser import BytesParser

    from voice_core_server.contracts import McpServerConfig
    expected = {'type':'mcp','server_label':'home_assistant','server_url':'https://example.test/mcp',
                'authorization':'test-scoped-token','allowed_tools':['search_devices','get_device_state','execute_device_action'],
                'require_approval':{'never':{'tool_names':['search_devices','get_device_state']}}}
    tool = McpServerConfig.model_validate({k:v for k,v in expected.items() if k != 'type'}).session_tool()
    observed = []
    def respond(request):
        assert str(request.url) == 'https://api.openai.com/v1/realtime/calls'
        message = BytesParser().parsebytes(b'Content-Type: '+request.headers['content-type'].encode()+b'\r\n\r\n'+request.content)
        part = next(p for p in message.walk() if p.get_param('name',header='content-disposition') == 'session')
        body = json.loads(part.get_payload(decode=True))
        observed.append(body)
        assert body['tools'] == [expected]
        assert 'server_description' not in body['tools'][0]
        return httpx.Response(201,text='v=0\r\nanswer')
    sink = Sink()
    result = asyncio.run(RealtimeSessionClient(sink,httpx.MockTransport(respond),[tool]).create('v=0\r\noffer',VoiceCoreConfig(),'test-key'))
    assert result[0].startswith('v=0') and len(observed)==1
    assert 'test-scoped-token' not in str(sink.events)
    with pytest.raises(ValidationError):
        McpServerConfig.model_validate({**{k:v for k,v in expected.items() if k != 'type'},'server_description':'unsupported'})
