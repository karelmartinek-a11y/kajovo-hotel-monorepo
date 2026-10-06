"""Removed capabilities cannot reconnect, prepare work or execute remote tools."""
import asyncio
from pathlib import Path

from sqlalchemy import inspect, text
from dagmar_server.browser_contract import schema
from dagmar_server.models import DagmarBase
from dagmar_server.settings import DagmarSettings
from .test_voice_memory_protocol import FakeRealtime, bridge_for, host as _host, voice_host as _voice_host

host = _host
voice_host = _voice_host


def test_contract_has_only_memory_and_registry():
    contract = schema()
    assert not any('mail' in path for path in contract['paths'])
    assert not any(name.startswith('Mail') for name in contract['components']['schemas'])
    assert not any('mail' in name for name in DagmarSettings.model_fields)
    assert 'dagmar_voice_mail_operations' not in DagmarBase.metadata.tables


def test_unknown_former_tools_never_connect_or_reserve_a_write(host, monkeypatch):
    async def run():
        provider = FakeRealtime('', {})
        bridge = await bridge_for(host, monkeypatch, provider)
        updates = [event['session'] for event in provider.sent if event['type'] == 'session.update' and 'tools' in event['session']]
        assert updates
        for update in updates:
            assert {tool['name'] for tool in update['tools']} <= {'assistant_memory', 'smart_technologie'}
            assert not any(term in update['instructions'].lower() for term in ['mail', 'pošt', 'smtp', 'imap', 'koncept'])
        assert 'mail' not in bridge.public_status()
        assert not hasattr(bridge.task_context, 'mail_conversation')
        for index, name in enumerate(['mail_conversation', 'mail_send_prepare', 'mail_send', 'mail_messages_count', 'unknown_function']):
            await bridge.result({'name': name, 'call_id': f'retired-{index}', 'arguments': '{}'})
            assert provider.answers[-1] == {'code': 'unsupported_capability', 'status': 'not_sent'}
        with host[1]() as db:
            assert db.scalar(text('SELECT count(*) FROM dagmar_voice_smart_deliveries')) == 0
        await bridge.close()
    asyncio.run(run())


def test_forward_migration_removes_both_metadata_tables_and_preserves_other_data(tmp_path, monkeypatch):
    from alembic import command
    from alembic.config import Config
    from sqlalchemy import create_engine
    from app.config import get_settings
    root = Path(__file__).resolve().parents[1]
    database = tmp_path / 'retirement.db'
    monkeypatch.setenv('KAJOVO_API_DATABASE_URL', f'sqlite:///{database}')
    get_settings.cache_clear()
    config = Config(str(root / 'alembic.ini'))
    config.set_main_option('script_location', str(root / 'alembic'))
    engine = create_engine(f'sqlite:///{database}')
    try:
        command.upgrade(config, '0044_voice_mail_operations')
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE dagmar_voice_mail_operations (id TEXT PRIMARY KEY, encrypted_token TEXT)'))
            connection.execute(text("INSERT INTO dagmar_voice_mail_operations VALUES ('old', 'retired')"))
            connection.execute(text("INSERT INTO voice_smart_deliveries (id, owner_session_id, arguments_digest, status) VALUES ('keep', 'owner', 'digest', 'delivered')"))
        command.upgrade(config, 'head')
        assert not {'voice_mail_operations', 'dagmar_voice_mail_operations'} & set(inspect(engine).get_table_names())
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT status FROM voice_smart_deliveries WHERE id='keep'")) == 'delivered'
        command.downgrade(config, '0043_voice_registry_plans')
        command.upgrade(config, 'head')
    finally:
        engine.dispose()
        get_settings.cache_clear()
