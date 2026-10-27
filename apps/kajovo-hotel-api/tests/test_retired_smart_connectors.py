"""The hotel cannot reconnect retired services through leftover environment values."""
import asyncio
from pathlib import Path
import runpy

import pytest

from app.config import Settings
from app.services import dagmar_adapter
from dagmar_server.ports import bind
from dagmar_server.smart import SmartError, mcp_connection
from dagmar_server.smartplan import SmartPlanClient


def test_retired_connections_fail_before_network_or_secret_access(monkeypatch):
    monkeypatch.setenv('KAJAVOICEHA_MCP_TOKEN', 'retired-fixture')
    monkeypatch.setenv('SMARTPLAN_VOICE_HOST_TOKEN', 'retired-fixture')
    monkeypatch.setenv('HA_MCP_URL', 'https://retired.example.test/mcp')
    monkeypatch.setenv('SMARTPLAN_BASE_URL', 'https://retired.example.test')
    config = Settings(_env_file=None, voice_mail_enabled=False)
    monkeypatch.setattr(dagmar_adapter, 'get_settings', lambda: config)
    application = dagmar_adapter.create_dagmar()
    settings = application.ports.settings
    assert not settings.ha_mcp_token
    assert not settings.ha_mcp_url
    assert not settings.ha_trusted_origins
    assert not settings.smartplan_base_url
    assert not settings.smartplan_trusted_origins
    assert settings.voice_mail_enabled == config.voice_mail_enabled
    assert application.ports.identity is dagmar_adapter.identity

    def forbidden(*args, **kwargs):
        pytest.fail('retired connector attempted network or secret access')

    monkeypatch.setattr('dagmar_server.smart.httpx.AsyncClient', forbidden)
    monkeypatch.setattr('dagmar_server.smartplan.SmartPlanSecretStore', forbidden)

    async def check():
        with bind(application.ports):
            with pytest.raises(SmartError, match='mcp_not_configured'):
                async with mcp_connection(settings.ha_mcp_token):
                    pytest.fail('retired HA connector connected')
            with pytest.raises(SmartError, match='smartplan_not_configured'):
                SmartPlanClient('fixture-owner')
            verifier = runpy.run_path(str(Path(__file__).resolve().parents[3] / 'scripts/verify_voice_mcp_live_readonly.py'))
            await verifier['verify'](application)

    asyncio.run(check())
