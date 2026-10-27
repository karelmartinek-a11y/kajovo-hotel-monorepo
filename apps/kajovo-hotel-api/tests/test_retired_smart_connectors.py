"""Retired capabilities have no runtime registration, even with leftover environment."""
import asyncio
import importlib.util
import json

from app.config import Settings
from app.services import dagmar_adapter
from dagmar_server.orchestration import VoiceBridge
from dagmar_server.ports import bind
from dagmar_server.settings import DagmarSettings
from voice_core_server import VoiceCoreConfig
import pytest
from pydantic import ValidationError


def test_retired_connections_are_absent_from_host_and_product(monkeypatch):
    for name in ('KAJAVOICEHA_MCP_TOKEN', 'SMARTPLAN_VOICE_HOST_TOKEN', 'HA_MCP_URL', 'SMARTPLAN_BASE_URL'):
        monkeypatch.setenv(name, 'retired-fixture')
    config = Settings(_env_file=None, voice_mail_enabled=False)
    monkeypatch.setattr(dagmar_adapter, 'get_settings', lambda: config)
    application = dagmar_adapter.create_dagmar()
    assert application.ports.identity is dagmar_adapter.identity
    assert not {'ha_mcp_token', 'ha_mcp_url', 'smartplan_base_url'} & DagmarSettings.model_fields.keys()
    for name in ('smart', 'smartplan', 'api_smartplan', 'registry', 'public_contract'):
        assert importlib.util.find_spec('dagmar_server.' + name) is None
    for name in ('voice_smart', 'voice_registry', 'smart_technologies'):
        assert importlib.util.find_spec('app.services.' + name) is None
    for field in ('ha_mcp_token', 'ha_mcp_url', 'smartplan_base_url'):
        with pytest.raises(ValidationError):
            DagmarSettings(**{field: 'retired-fixture'})
    assert not any('smartplan' in route.path or 'registry-plan' in route.path for route in application.core.routes)

    async def check():
        with bind(application.ports):
            bridge = VoiceBridge('fixture-owner', 'rtc_fixture', 'fixture-key', VoiceCoreConfig(), 'gpt-realtime-2.1')
            sent = []
            async def send(event, match):
                sent.append(event)
                return {'type': 'session.updated', 'event_id': 'ack', 'session': event['session']}
            bridge.send = send
            await bridge.configure()
            tools = sent[-1]['session']['tools']
            assert [tool['name'] for tool in tools] == ['assistant_memory']
            assert not hasattr(bridge, 'mcp') and not hasattr(bridge, 'smartplan') and not hasattr(bridge, 'registry')
            outputs = []
            async def item(value):
                outputs.append(value)
            bridge.item = item
            for name in ('smart_technologie', 'smartplan_commit'):
                await bridge._result({'name': name, 'call_id': name, 'arguments': '{}'})
            assert all(json.loads(output['output']) == {'code': 'unsupported_capability', 'status': 'not_sent'} for output in outputs)
    asyncio.run(check())
