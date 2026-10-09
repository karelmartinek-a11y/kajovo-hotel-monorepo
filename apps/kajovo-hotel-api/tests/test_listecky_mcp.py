"""Real Streamable HTTP, separate SQLite data, and host identity recovery."""
import asyncio
import json
from contextlib import asynccontextmanager
from dataclasses import replace
import socket
from threading import Thread
import time
from types import SimpleNamespace

from mcp.server.fastmcp import FastMCP
import pytest
from sqlalchemy import select, func
import uvicorn

from app.services.listecky_mcp import ListeckyMemory
from dagmar_server import memory, memory_dispatch
from dagmar_server.memory_contract import MemoryRequest, MemoryResult
from dagmar_server.migrations import SHARED_ID
from dagmar_server.models import VoiceNote, VoiceMemoryOperation
from dagmar_server.ports import RuntimePorts, bind, runtime
from .test_voice_memory_protocol import FakeRealtime, bridge_for, wait_for, host as _host, voice_host as _voice_host

host = _host
voice_host = _voice_host


def request(operation, **args):
    return MemoryRequest.model_validate({'request': {'operation': operation, **args}})


@pytest.fixture
def service(host):
    _, factory, _ = host
    with factory() as db:
        memory.ensure_profile(db, SHARED_ID)
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        port = listener.getsockname()[1]
    mcp = FastMCP('isolated-listecky', host='127.0.0.1', port=port, stateless_http=True, json_response=True)

    @mcp.tool()
    def assistant_memory(request: dict, operation_id: str | None = None) -> MemoryResult:
        payload = MemoryRequest.model_validate({'request': request})
        with factory() as db:
            return memory.execute(db, SHARED_ID, payload, session_id='mcp-v1', call_id=operation_id,
                                  receipt_namespace='isolated-mcp')

    @asynccontextmanager
    async def lifespan(app):
        async with mcp.session_manager.run():
            yield
    app = mcp.streamable_http_app()
    app.router.lifespan_context = lifespan
    server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=port, log_level='critical', access_log=False))
    thread = Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.01)
    assert server.started
    connector = ListeckyMemory('Bearer isolated-test-only', url=f'http://127.0.0.1:{port}/mcp')
    yield factory, connector
    server.should_exit = True
    thread.join(timeout=5)
    assert not thread.is_alive()


def test_real_mcp_revisions_full_content_and_host_retry_after_lost_response(service):
    factory, connector = service
    calls = []

    async def lose_once(payload, operation_id):
        calls.append(operation_id)
        result = await connector(payload, operation_id)
        if len(calls) == 1:
            raise ConnectionError('isolated_lost_response_after_commit')
        return result

    async def scenario():
        payload = request('note_create', title='Integration only', kind='list', items=['One', 'Two'], content=None)
        for attempt in range(2):
            # A new host runtime/session models reconnect and process recovery.
            with bind(RuntimePorts(factory, SimpleNamespace(), lambda _: None, memory_connector=lose_once)):
                with factory() as db:
                    result = await memory_dispatch.execute(db, SHARED_ID, payload, session_id='logical-call', call_id='verified-audio-task', receipt_namespace='admin-a')
            assert result.code == ('unavailable' if attempt == 0 else 'ok')
        assert calls[0] == calls[1] and result.replayed
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(VoiceNote)) == 1
            receipt = db.get(VoiceMemoryOperation, memory_dispatch.receipt_identity(SHARED_ID, 'admin-a', 'logical-call', 'verified-audio-task'))
            assert receipt.result_code == 'ok'
            original = memory.note_read(db, db.get(VoiceNote, result.note.id))
        direct = await connector(request('note_read', id=result.note.id), None)
        assert direct.note == original and [i.content for i in direct.note.items] == ['One', 'Two']
        updated = await connector(request('note_item_add', id=direct.note.id, revision=direct.note.revision, content='Three', position=None), '00000000-0000-0000-0000-000000000001')
        assert updated.code == 'ok' and updated.note.revision == direct.note.revision + 1
        conflict = await connector(request('note_clear', id=direct.note.id, revision=direct.note.revision), '00000000-0000-0000-0000-000000000002')
        assert conflict.code == 'revision_conflict'
        with bind(RuntimePorts(factory, SimpleNamespace(), lambda _: None, memory_connector=lose_once)):
            with factory() as db:
                changed = await memory_dispatch.execute(db, SHARED_ID, request('note_create', title='Changed', kind='list', items=[], content=None), session_id='logical-call', call_id='verified-audio-task', receipt_namespace='admin-a')
        assert changed.code == 'identity_conflict' and len(calls) == 2
        protected = await connector(request('memory_forget', id=memory.PROFILE_ID, revision=1), '00000000-0000-0000-0000-000000000003')
        assert protected.code == 'profile_protected'
    asyncio.run(scenario())


def test_mcp_outage_never_falls_back_or_reports_an_empty_success(service):
    factory, _ = service
    async def scenario():
        unavailable = ListeckyMemory('Bearer isolated-only', url='http://127.0.0.1:1/mcp')
        with bind(RuntimePorts(factory, SimpleNamespace(), lambda _: None, memory_connector=unavailable)):
            with factory() as db:
                result = await memory_dispatch.execute(db, SHARED_ID, request('note_create', title='Must not exist', kind='list', items=[], content=None), session_id='logical-call', call_id='outage', receipt_namespace='admin-a')
                assert result.code == 'unavailable'
                assert db.scalar(select(func.count()).select_from(VoiceNote)) == 0
                read = await memory_dispatch.execute(db, SHARED_ID, request('note_list', query='', archived=False, limit=20, offset=0))
                assert read.code == 'unavailable'
    asyncio.run(scenario())


def test_voice_native_intent_precedes_real_mcp_write_and_external_delete_clears_provider(host, service, monkeypatch):
    factory, connector = service
    payload = {'operation':'note_create', 'title':'Voice integration', 'kind':'list', 'items':['Synthetic'], 'content':None}
    provider = FakeRealtime('Vytvoř lístek Voice integration s položkou Synthetic.', payload)
    invocations = []
    async def observed(request, operation_id):
        invocations.append(operation_id)
        return await connector(request, operation_id)
    async def scenario():
        with bind(replace(runtime(), memory_connector=observed)):
            bridge = await bridge_for(host, monkeypatch, provider, logical_call_id='mcp-logical')
            await bridge.memory_result({'call_id':'untrusted-data', 'arguments':json.dumps({'request':payload})})
            assert provider.answers[-1]['code'] == 'human_intent_required' and not invocations
            await provider.user_phrase('native-write')
            await wait_for(lambda: len(provider.answers) == 2)
            assert provider.answers[-1]['code'] == 'ok' and len(invocations) == 1
            with factory() as db:
                note = db.scalar(select(VoiceNote))
                assert note.title == 'Voice integration'
                identity, revision = note.id, note.revision
            old_items = set(bridge.dialog_items)
            result = await connector(request('note_delete', id=identity, revision=revision), '00000000-0000-0000-0000-000000000004')
            assert result.code == 'ok'
            await wait_for(lambda: bridge.memory_privacy_paused)
            await wait_for(lambda: any(e.get('type') == 'conversation.item.delete' and e.get('item_id') in old_items for e in provider.sent))
            assert bridge.task_context.memory_privacy_paused and not bridge.memory_buffer.enabled
            await bridge.close()
    asyncio.run(scenario())
