"""No provider calls or mail mutations: native lifecycle and trusted consent gates."""
import asyncio
import base64
import copy
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from dagmar_server.mail import MailHost, MailTask, readback
from dagmar_server.mail_contract import CATALOG, TOOLS, tool_config, verify_catalog, verify_import, MailContractError
from dagmar_server.mail_storage import MailReceipt, MailSecretStore, MailSecrets
from dagmar_server.migrations import upgrade
from dagmar_server.ports import RuntimePorts, bind
from dagmar_server.settings import DagmarSettings
from dagmar_server.turns import TurnCoordinator


def host():
    engine = create_engine('sqlite://')
    upgrade(engine)
    ports = RuntimePorts(sessionmaker(engine), DagmarSettings(voice_master_key=base64.b64encode(b'k'*32).decode()),
                         lambda owner: {'voice_authorized': True, 'namespace': owner} if owner == 'owner' else None)
    bridge = SimpleNamespace(owner='owner', id='provider-one', logical_call_id='logical-one', closed=False,
        turns=TurnCoordinator(), catalog_ready=False, task_context=SimpleNamespace(mail=MailTask(), recovered_generation=None),
        human_turns=SimpleNamespace(generation=0), sent=[])
    async def item(value):
        bridge.sent.append(value)
    async def send(value, match):
        bridge.sent.append(value)
        return {'type':'response.created','response': {'id': 'readback'}}
    async def noop(*args, **kwargs):
        pass
    bridge.item, bridge.send, bridge.configure, bridge.update_transcription = item, send, noop, noop
    value = MailHost(bridge)
    value.status = 'ready'
    return engine, ports, bridge, value


def snapshot():
    return {'send_request_id':'request-1', 'draft_id':'draft-1', 'version':2, 'account':'recepce',
            'content_hash':'f'*64, 'expires_at':(datetime.now(timezone.utc)+timedelta(minutes=5)).timestamp(),
            'content':{'to':['fixture@example.invalid'],'cc':[],'bcc':[],'subject':'Syntetický test','text':'Syntetický obsah'},
            'attachment_manifest':[{'name':'fixture.txt','mime_type':'text/plain','size':5,'sha256':'a'*64}]}


def event(bridge, mail, typ, **fields):
    value = {'type': typ, **fields}
    bridge.turns.event(value)
    return mail.observe(value)


def test_catalog_is_exact_and_requires_only_send_approval():
    verify_catalog(CATALOG)
    native = [{'name': t['name'], 'input_schema': t['inputSchema']} for t in CATALOG]
    verify_import(native)
    config = tool_config('synthetic-not-a-real-token')
    assert config['allowed_tools'] == sorted(TOOLS)
    assert config['require_approval']['always']['tool_names'] == ['mail_send_execute']
    assert len(config['require_approval']['never']['tool_names']) == 22
    drift = copy.deepcopy(CATALOG)
    drift[0]['annotations']['readOnlyHint'] = not drift[0]['annotations']['readOnlyHint']
    with pytest.raises(MailContractError):
        verify_catalog(drift)
    with pytest.raises(MailContractError):
        verify_import(native[:-1])


@pytest.mark.parametrize('order', [('transport','output','done'), ('done','transport','output'), ('output','done','transport')])
def test_continuation_waits_for_transport_result_and_response_once(order):
    turns = TurnCoordinator()
    turns.event({'type':'response.created','response':{'id':'r'}})
    item = {'id':'m', 'type':'mcp_call', 'server_label':'hotel_mail', 'name':'mail_search', 'output':'{}'}
    turns.event({'type':'response.output_item.added','response_id':'r','item':{**item,'output':None}})
    events = {'transport': {'type':'response.mcp_call.completed','item_id':'m'},
              'output': {'type':'response.output_item.done','response_id':'r','item':item},
              'done': {'type':'response.done','response':{'id':'r','status':'completed','output':[]}}}
    for stage in order[:-1]:
        turns.event(events[stage])
        assert turns.ready_responses() == []
    turns.event(events[order[-1]])
    assert turns.claim_response('r', 0)
    assert not turns.claim_response('r', 0)


def test_mixed_functions_multiple_mcp_approval_and_barge_in():
    turns = TurnCoordinator()
    turns.event({'type':'response.created','response':{'id':'r'}})
    output = [{'id':'f','call_id':'f-call','type':'function_call'}, {'id':'m1','type':'mcp_call','output':'{}'},
              {'id':'m2','type':'mcp_call','output':'{}'}, {'id':'a','type':'mcp_approval_request'}]
    turns.event({'type':'response.done','response':{'id':'r','status':'completed','output':output}})
    for iid in ('m1','m2'):
        turns.event({'type':'response.mcp_call.completed','item_id':iid})
    assert not turns.ready_responses()
    turns.function_finished('f-call')
    assert not turns.ready_responses()
    turns.approval_finished('a')
    assert turns.ready_responses() == [('r',0)]
    turns.event({'type':'input_audio_buffer.speech_started'})
    assert not turns.claim_response('r',0)


def test_secrets_have_separate_authenticated_data_and_no_plaintext_storage():
    engine, ports, _, _ = host()
    with bind(ports):
        store = MailSecretStore()
        store.save('synthetic-mcp-token', 'synthetic-approval-token')
        assert store.read() == ('synthetic-mcp-token', 'synthetic-approval-token')
        with ports.session_factory() as db:
            row = db.get(MailSecrets,1)
            assert 'synthetic' not in row.mcp_ciphertext + row.approval_ciphertext
            row.mcp_ciphertext, row.approval_ciphertext = row.approval_ciphertext, row.mcp_ciphertext
            db.commit()
        with pytest.raises(Exception, match='mail_secret_store_unavailable'):
            store.read()
    with engine.connect() as conn:
        assert conn.exec_driver_sql('SELECT version FROM dagmar_schema_version').scalar() == 1
        assert conn.exec_driver_sql('SELECT version FROM dagmar_mail_schema_version').scalar() == 1
    assert upgrade(engine)['already_applied']


def test_approval_requires_exact_completed_drained_audio_and_committed_next_input():
    async def run():
        _, ports, bridge, mail = host()
        data = snapshot()
        control = []
        async def request(method,path,payload=None):
            control.append((method,path,payload))
            return data if method == 'GET' else {'state':'approved','send_request_id':'request-1','content_hash':data['content_hash']}
        mail.control = request
        item = {'type':'mcp_approval_request','id':'approval-one','name':'mail_send_execute',
                'arguments':'{"send_request_id":"request-1","idempotency_key":"synthetic-key"}'}
        with bind(ports):
            await mail.prepare(item)
            text = mail.pending['text']
            assert text == readback(data) + ' Mám tuto zprávu odeslat?'
            event(bridge, mail, 'response.done', response={'id':'readback','status':'completed','output':[{'content':[{'type':'output_audio','transcript':text}]}]})
            assert mail.pending['state'] == 'reading'
            event(bridge, mail, 'output_audio_buffer.stopped', response_id='readback')
            assert mail.pending['state'] == 'awaiting'
            event(bridge, mail, 'conversation.item.input_audio_transcription.completed',item_id='text-only', event_id='text',transcript='ano')
            assert mail.pending['state'] == 'awaiting'
            event(bridge, mail, 'input_audio_buffer.speech_started',item_id='audio')
            event(bridge, mail, 'input_audio_buffer.committed',item_id='audio')
            action = event(bridge, mail, 'conversation.item.input_audio_transcription.completed',item_id='audio',event_id='native',transcript='ano')
            assert action == 'approve'
            await mail.work(action)
            approvals = [v for v in bridge.sent if v.get('type') == 'mcp_approval_response']
            assert approvals == [{'type':'mcp_approval_response','approval_request_id':'approval-one','approve':True}]
            assert len([c for c in control if c[0]=='POST']) == 1
            await mail.work('approve')
            with ports.session_factory() as db:
                rows = list(db.scalars(select(MailReceipt)))
                assert len(rows) == 1 and rows[0].state == 'provider_approved'
                assert rows[0].draft_version == 2 and rows[0].audio_event_id == 'native:audio'
                assert not {'content','recipient','transcript','subject'} & set(MailReceipt.__table__.columns.keys())
    asyncio.run(run())


def test_interruption_during_readback_rejects_without_control_write():
    async def run():
        _, ports, bridge, mail = host()
        async def request(*args):
            return snapshot()
        mail.control = request
        with bind(ports):
            await mail.prepare({'id':'approval','name':'mail_send_execute','arguments':'{"send_request_id":"request-1","idempotency_key":"synthetic-key"}'})
            action = event(bridge,mail,'input_audio_buffer.speech_started',item_id='interrupt')
            assert action == 'reject'
            await mail.work(action)
            assert bridge.sent[-1] == {'type':'mcp_approval_response','approval_request_id':'approval','approve':False}
    asyncio.run(run())


def test_disabled_mail_never_reads_credentials_or_touches_provider():
    async def run():
        _, ports, bridge, mail = host()
        mail.status = 'disabled'
        with bind(ports):
            task = asyncio.create_task(mail.initialize())
            await asyncio.sleep(0)
            assert mail.status == 'disabled' and bridge.sent == [] and mail.tools() == []
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    asyncio.run(run())


@pytest.mark.parametrize('acceptance_sha', ['', 'other-release'])
def test_activation_without_exact_release_acceptance_never_reads_secrets(acceptance_sha, monkeypatch):
    async def run():
        _, ports, bridge, mail = host()
        ports.settings.voice_mail_enabled = True
        ports.settings.voice_release_sha = 'current-release'
        ports.settings.voice_mail_acceptance_sha = acceptance_sha
        mail.status = 'disabled'
        def forbidden_read(*args):
            raise AssertionError('unaccepted release accessed credentials')
        monkeypatch.setattr(MailSecretStore, 'read', forbidden_read)
        with bind(ports):
            task = asyncio.create_task(mail.initialize())
            await asyncio.sleep(0)
            assert mail.status == 'unavailable' and bridge.sent == [] and mail.tools() == []
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
    asyncio.run(run())


@pytest.mark.parametrize('failure', ['expiry','revocation','new_generation','used_audio'])
def test_reserved_consent_cannot_cross_lifetime_or_audio_identity(failure):
    async def run():
        _, ports, bridge, mail = host()
        posts = []
        data = snapshot()
        async def request(method,path,payload=None):
            posts.append(payload)
            return {'state':'approved','send_request_id':'request-1','content_hash':data['content_hash']}
        mail.control = request
        with bind(ports):
            pending = {'state':'confirmed','item_id':'a', 'snapshot':data, 'expires':datetime.now(timezone.utc)+timedelta(minutes=1),
                'args':{'send_request_id':'request-1','idempotency_key':'synthetic-key'},
                'audio':{'identity':'native:audio','generation':0}}
            mail.pending = pending
            if failure == 'expiry':
                pending['expires'] = datetime.now(timezone.utc)-timedelta(seconds=1)
            if failure == 'revocation':
                bridge.owner = 'foreign'
            if failure == 'new_generation':
                bridge.turns.generation = 1
            if failure == 'used_audio':
                with ports.session_factory() as db:
                    db.add(MailReceipt(id='previous',owner='owner',logical_call_id='logical-one',voice_session_id='old-provider',audio_event_id='native:audio',
                        approval_request_id='old-approval',send_request_id='request-1',content_hash='f'*64,draft_version=2,idempotency_key='old-key',state='provider_approved',expires_at=pending['expires']))
                    db.commit()
            await mail.approve(True)
            assert posts == []
            assert bridge.sent[-1]['approve'] is False
    asyncio.run(run())


def test_schema_drift_and_import_transport_are_independent():
    _, ports, bridge, mail = host()
    with bind(ports):
        mail.status = 'loading'
        tools = [{'name':t['name'],'input_schema':t['inputSchema']} for t in CATALOG]
        event(bridge,mail,'conversation.item.done', item={'type':'mcp_list_tools','id':'catalog','server_label':'hotel_mail','tools':tools})
        assert not mail.imported.is_set()
        event(bridge,mail,'mcp_list_tools.completed',item_id='catalog')
        assert mail.imported.is_set()
        other = MailHost(bridge)
        event(bridge,other,'conversation.item.done', item={'type':'mcp_list_tools','id':'bad','server_label':'hotel_mail','tools':tools[:-1]})
        assert other.status == 'incompatible'


def test_reconnect_mail_context_never_restores_provider_approval_or_bodies():
    from dagmar_server.task_context import CallTask
    from dagmar_server.token_budget import measure
    import json
    task = CallTask()
    task.mail.remember({'query_id':'opaque-query','text':'private-body','to':['private-recipient'], 'next_cursor':'opaque-cursor'})
    task.mail.mutations['original'] = {'tool_name':'mail_send_execute','send_request_id':'request','idempotency_key':'original-key','state':'uncertain'}
    snapshot_text = json.dumps(task.snapshot())
    assert 'private-body' not in snapshot_text and 'private-recipient' not in snapshot_text
    assert 'original-key' in snapshot_text and 'opaque-query' in snapshot_text
    assert 'mcp_approval_request' not in snapshot_text and 'mcp_approval_response' not in snapshot_text
    assert measure(snapshot_text).tokens <= 4000 and measure(snapshot_text).utf8_bytes <= 24000
    task.clear()
    assert task.mail.snapshot() == {'identities':[],'mutations':[],'scope':None,'last_messages':[]}


def test_recovered_generation_exposes_only_read_tools_until_new_audio():
    _, ports, bridge, mail = host()
    with bind(ports):
        mail.status = 'ready'
        bridge.task_context.recovered_generation = 0
        assert 'mail_send_execute' not in mail.tools()[0]['allowed_tools']
        bridge.human_turns.generation = 1
        assert set(mail.tools()[0]['allowed_tools']) == set(TOOLS)


def test_barge_in_during_control_review_cannot_revive_old_question():
    async def run():
        _, ports, bridge, mail = host()
        async def request(*args):
            bridge.turns.event({'type':'input_audio_buffer.speech_started','item_id':'new-task'})
            return snapshot()
        mail.control = request
        with bind(ports):
            await mail.prepare({'id':'approval','name':'mail_send_execute','arguments':'{"send_request_id":"request-1","idempotency_key":"synthetic-key"}'})
            assert not mail.pending
            assert bridge.sent == [{'type':'mcp_approval_response','approval_request_id':'approval','approve':False}]
    asyncio.run(run())


def test_mail_deadline_starts_with_native_input_not_first_result(monkeypatch):
    _, ports, bridge, mail = host()
    now = [100.0]
    monkeypatch.setattr('dagmar_server.mail.time.monotonic',lambda:now[0])
    with bind(ports):
        event(bridge,mail,'input_audio_buffer.speech_started',item_id='human')
        now[0] += 601
        assert not mail.task.account(bridge.turns.generation,calls=1)
        assert mail.task.limited


def test_preflight_uses_real_sdk_transport_before_native_provider_import(monkeypatch):
    import httpx
    async def run():
        _, ports, bridge, mail = host()
        ports.settings.voice_mail_enabled = True
        ports.settings.voice_release_sha = ports.settings.voice_mail_acceptance_sha = 'sdk-fixture'
        bridge.model = 'gpt-realtime-2.1'
        mail.status = 'disabled'
        requests = []
        def server(request):
            assert request.headers['authorization'] == 'Bearer synthetic-mcp-fixture'
            if request.method != 'POST':
                return httpx.Response(405)
            payload = __import__('json').loads(request.content)
            requests.append(payload['method'])
            if payload['method'] == 'notifications/initialized':
                return httpx.Response(202)
            if payload['method'] == 'initialize':
                result = {'protocolVersion':payload['params']['protocolVersion'],'capabilities':{},'serverInfo':{'name':'fixture','version':'1'}}
            elif payload['method'] == 'tools/list':
                result = {'tools':CATALOG}
            else:
                raise AssertionError('unexpected_sdk_operation')
            return httpx.Response(200,json={'jsonrpc':'2.0','id':payload['id'],'result':result})
        client = httpx.AsyncClient
        monkeypatch.setattr('dagmar_server.mail.httpx.AsyncClient',lambda **kwargs:client(transport=httpx.MockTransport(server),**kwargs))
        with bind(ports):
            MailSecretStore().save('synthetic-mcp-fixture','synthetic-control-fixture')
            task = asyncio.create_task(mail.initialize())
            try:
                async with asyncio.timeout(3):
                    while not bridge.sent:
                        await asyncio.sleep(.01)
                assert mail.status == 'loading'
                assert requests == ['initialize','notifications/initialized','tools/list']
                native = bridge.sent[0]['response']['tools'][0]
                assert native['authorization'] == 'synthetic-mcp-fixture' and len(native['allowed_tools']) == 23
                assert 'synthetic-control-fixture' not in str(bridge.sent)
            finally:
                task.cancel()
                await asyncio.gather(task,return_exceptions=True)
    asyncio.run(run())


def test_reconnect_preserves_send_key_before_native_execution():
    import json
    from dagmar_server.mail_storage import MailOperation
    from dagmar_server.task_context import CallTask
    async def run():
        _, ports, bridge, mail = host()
        bridge.task_context = CallTask()
        async def control(*args):
            return snapshot()
        mail.control = control
        with bind(ports):
            await mail.prepare({'id':'original-approval','name':'mail_send_execute',
                                'arguments':json.dumps({'send_request_id':'request-1','idempotency_key':'original-send-key'})})
            mail.close()
            restored = json.dumps(bridge.task_context.snapshot())
            assert 'original-send-key' in restored and 'request-1' in restored
            assert 'original-approval' not in restored and 'mcp_approval_request' not in restored
            assert 'Syntetický obsah' not in restored and 'fixture@example.invalid' not in restored
            with ports.session_factory() as db:
                row = db.scalar(select(MailOperation))
                assert row.state == 'awaiting_approval' and row.idempotency_key == 'original-send-key'
                assert not {'content','subject','recipient','transcript'} & set(MailOperation.__table__.columns.keys())
    asyncio.run(run())


@pytest.mark.parametrize('intervening_turn', [False,True])
def test_send_it_shortcut_requires_immediately_following_native_input(intervening_turn):
    async def run():
        _, ports, bridge, mail = host()
        data = snapshot()
        posts = []
        async def control(method,path,payload=None):
            if method == 'POST':
                posts.append(payload)
                return {'state':'approved','send_request_id':data['send_request_id'],'content_hash':data['content_hash']}
            return data
        mail.control = control
        with bind(ports):
            mail.disclosure = data
            event(bridge,mail,'response.created',response={'id':'disclosure'})
            event(bridge,mail,'response.done',response={'id':'disclosure','status':'completed','output':[
                {'content':[{'type':'output_audio','transcript':readback(data)}]}]})
            event(bridge,mail,'output_audio_buffer.stopped',response_id='disclosure')
            if intervening_turn:
                event(bridge,mail,'input_audio_buffer.speech_started',item_id='other-task')
                event(bridge,mail,'input_audio_buffer.committed',item_id='other-task')
                event(bridge,mail,'conversation.item.input_audio_transcription.completed',item_id='other-task',event_id='other-native',transcript='Kolik je hodin?')
            event(bridge,mail,'input_audio_buffer.speech_started',item_id='send-it')
            event(bridge,mail,'input_audio_buffer.committed',item_id='send-it')
            event(bridge,mail,'conversation.item.input_audio_transcription.completed',item_id='send-it',event_id='send-native',transcript='Pošli to')
            await mail.prepare({'id':'send-approval','name':'mail_send_execute','arguments':'{"send_request_id":"request-1","idempotency_key":"original-key"}'})
            questions = [frame for frame in bridge.sent if frame.get('type')=='response.create']
            if intervening_turn:
                assert len(questions)==1 and mail.pending['state']=='reading' and not posts
            else:
                assert not questions and len(posts)==1 and not mail.pending
                assert bridge.sent[-1]['approve'] is True
    asyncio.run(run())
