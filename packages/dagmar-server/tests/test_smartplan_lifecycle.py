"""Transport evidence must precede recovery rights, using actual host/store/SDK."""
import asyncio
import json
from dataclasses import replace
import httpx
from sqlalchemy import select
import pytest
from dagmar_server.ports import bind
from dagmar_server.smart import SmartError
from dagmar_server.smartplan import SmartPlanClient
from dagmar_server.smartplan_storage import SmartPlanReceipt, SmartPlanAuthorization, SmartPlanDelivery
from test_smartplan import setup, approve
from test_public_bridge import Candidate

def native(bridge, name):
    bridge.human_turns.event({'type':'input_audio_buffer.speech_started','item_id':name})
    bridge.human_turns.event({'type':'input_audio_buffer.committed','item_id':name})

@pytest.mark.parametrize('modern', [False, True])
def test_cancelled_before_actual_wire_cannot_gain_first_effect_from_new_intent(modern):
    async def run():
        _, ports, bridge, host, fixture = setup(Candidate() if modern else None)
        with bind(ports):
            native(bridge, 'original')
            if modern:
                await host.client.initialize()
                value = await host.execute('smartplan_prepare_change', {'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'original-request'})
                proposal = value['proposal_id']
            else:
                await host.execute('smartplan_prepare', {'operation':'pause','scenario_id':'scenario','expected_revision':7})
                approve(bridge, host)
                proposal = 'server-proposal'
            checks = 0
            def guard():
                nonlocal checks
                checks += 1
                # commit's initial guard passes; the actual client dispatch fails.
                if checks >= 3:
                    raise SmartError('cancelled_not_sent')
            bridge.assert_current_operation = guard
            with pytest.raises(SmartError):
                await host.commit(proposal)
            assert fixture.submissions == 0
            bridge.assert_current_operation = lambda: None
            native(bridge, 'different-intent')
            with pytest.raises(SmartError):
                await host.commit(proposal)
            assert fixture.submissions == 0
            with ports.session_factory() as db:
                row = db.scalars(select(SmartPlanReceipt)).one()
                assert row.state == 'cancelled_not_sent'
            await host.close()
    asyncio.run(run())

def test_invalidated_equal_digest_refresh_restores_verified_client_projection():
    async def run():
        _, ports, _, host, _ = setup(Candidate())
        with bind(ports):
            await host.client.initialize()
            digest = host.client.contract.metadata_digest
            host.client.invalidate_metadata()
            assert await host.client.refresh_metadata() is True
            assert host.client.metadata_available
            assert host.client.projection['metadata_digest'] == digest
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('modern', [False, True])
@pytest.mark.parametrize('boundary', ['initialize', 'queued', 'wire'])
def test_async_cancel_before_business_emission_preserves_not_sent(modern, boundary):
    async def run():
        _, ports, bridge, host, fixture = setup(Candidate() if modern else None)
        with bind(ports):
            native(bridge, 'original')
            if modern:
                await host.client.initialize()
                value = await host.execute('smartplan_prepare_change', {
                    'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'stable-prepare'})
                proposal = value['proposal_id']
            else:
                await host.execute('smartplan_prepare', {'operation':'pause','scenario_id':'scenario','expected_revision':7})
                approve(bridge, host)
                proposal = 'server-proposal'
            entered = asyncio.Event()
            original_initialize, original_put, original_send = host.client.initialize, host.client.requests.put_nowait, host.client.http.send
            async def blocked_initialize():
                entered.set()
                await asyncio.Future()
            def queued(value):
                if value[0] == 'smartplan_commit':
                    entered.set()
                    # Remains outside the transport owner; cancellation cancels its waiter.
                    return
                original_put(value)
            async def blocked_wire(request, **kwargs):
                body = json.loads(request.content) if request.method == 'POST' else {}
                if body.get('params', {}).get('name') == 'smartplan_commit':
                    entered.set()
                    await asyncio.Future()
                return await original_send(request, **kwargs)
            if boundary == 'initialize':
                host.client.initialize = blocked_initialize
            elif boundary == 'queued':
                host.client.requests.put_nowait = queued
            else:
                host.client.http.send = blocked_wire
            task = asyncio.create_task(host.commit(proposal))
            await asyncio.wait_for(entered.wait(), 2)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            host.client.initialize, host.client.requests.put_nowait, host.client.http.send = original_initialize, original_put, original_send
            native(bridge, 'obsolete-recovery-attempt')
            with pytest.raises(SmartError):
                await host.commit(proposal)
            with ports.session_factory() as db:
                attempt = db.scalars(select(SmartPlanAuthorization)).one()
                assert attempt.commit_transport == 'not_sent'
                assert attempt.state == 'cancelled_not_sent'
                if not modern:
                    assert attempt.confirm_transport == 'acknowledged'
            assert fixture.submissions == 0
            await host.close()
    asyncio.run(run())


def test_fresh_exact_native_prepare_appends_grant_without_overwriting_cancelled_history():
    async def run():
        _, ports, bridge, host, fixture = setup(Candidate())
        with bind(ports):
            await host.client.initialize()
            native(bridge, 'original')
            args = {'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'prepare-one'}
            value = await host.execute('smartplan_prepare_change', args)
            original_guard = bridge.assert_current_operation
            count = 0
            def obsolete():
                nonlocal count
                count += 1
                if count >= 2:
                    raise SmartError('cancelled_not_sent')
            bridge.assert_current_operation = obsolete
            with pytest.raises(SmartError):
                await host.commit(value['proposal_id'])
            bridge.assert_current_operation = original_guard
            with ports.session_factory() as db:
                original_input = db.scalars(select(SmartPlanReceipt)).one().input_event_id
            native(bridge, 'fresh-exact-request')
            args['request_key'] = 'prepare-two'
            await host.execute('smartplan_prepare_change', args)
            await host.commit(value['proposal_id'])
            with ports.session_factory() as db:
                attempts = db.scalars(select(SmartPlanAuthorization).order_by(SmartPlanAuthorization.created_at)).all()
                assert len(attempts) == 2
                assert (attempts[0].state, attempts[0].commit_transport) == ('cancelled_not_sent','not_sent')
                assert (attempts[1].state, attempts[1].commit_transport) == ('completed','maybe_sent')
                assert attempts[0].input_event_id != attempts[1].input_event_id
                assert db.scalars(select(SmartPlanReceipt)).one().input_event_id == original_input
            assert fixture.submissions == 1
            await host.close()
    asyncio.run(run())


def test_sent_response_loss_and_restart_recover_only_original_id_with_at_most_one_effect():
    async def run():
        fixture = Candidate()
        sent, release = asyncio.Event(), asyncio.Event()
        async def transport(request):
            value = fixture(request)
            if request.method == 'POST':
                body = json.loads(request.content)
                if body.get('params', {}).get('name') == 'smartplan_commit' and not release.is_set():
                    sent.set()
                    await release.wait()
                    raise httpx.ReadTimeout('synthetic lost response')
            return value
        _, ports, bridge, host, _ = setup(fixture)
        ports = replace(ports, smartplan_transport=httpx.MockTransport(transport))
        with bind(ports):
            await host.client.close()
            host.client = SmartPlanClient('admin-profile:1')
            await host.client.initialize()
            native(bridge, 'original')
            value = await host.execute('smartplan_prepare_change', {
                'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'original-request'})
            task = asyncio.create_task(host.commit(value['proposal_id']))
            await asyncio.wait_for(sent.wait(), 2)
            native(bridge, 'different-generation')
            release.set()
            with pytest.raises(SmartError, match='uncertain'):
                await task
            await host.close()
            bridge.id = 'reconnected-provider-session'
            host.client = SmartPlanClient('admin-profile:1')
            await host.client.initialize()
            result = await host.commit(value['proposal_id'])
            assert result['operation_id'] == 'original-operation'
            assert fixture.submissions == 1
            commits = [body['params']['arguments'] for _, body in fixture.calls
                       if body.get('params', {}).get('name') == 'smartplan_commit']
            assert commits == [{'proposal_id':'candidate-proposal'}] * 2
            assert len([body for _, body in fixture.calls if body.get('params', {}).get('name') == 'smartplan_prepare_change']) == 1
            with ports.session_factory() as db:
                attempt = db.scalars(select(SmartPlanAuthorization)).one()
                assert attempt.commit_transport == 'maybe_sent' and attempt.voice_session_id == 'provider-one'
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('state', ['dispatching','uncertain'])
def test_legacy_unknown_restart_is_not_recovery_permission(state):
    async def run():
        _, ports, bridge, host, fixture = setup(Candidate())
        with bind(ports):
            await host.client.initialize()
            native(bridge, 'old')
            value = await host.execute('smartplan_prepare_change', {
                'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'original'})
            with ports.session_factory() as db:
                db.query(SmartPlanAuthorization).delete()
                row = db.scalars(select(SmartPlanReceipt)).one()
                row.state = state
                db.commit()
            bridge.id = 'new-provider'
            native(bridge, 'unrelated')
            with pytest.raises(SmartError, match='legacy_dispatch_unknown_no_replay'):
                await host.commit(value['proposal_id'])
            assert fixture.submissions == 0
            with ports.session_factory() as db:
                row = db.scalars(select(SmartPlanReceipt)).one()
                assert row.state == state and row.voice_session_id == 'provider-one'
            bridge.logical_call_id = 'foreign-logical-call'
            with pytest.raises(SmartError, match='confirmation_required'):
                await host.commit(value['proposal_id'])
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('boundary', ['initialize','wire'])
def test_delivery_cancel_tracks_original_request_without_unsent_replay(boundary):
    async def run():
        _, ports, bridge, host, fixture = setup(Candidate())
        with bind(ports):
            await host.client.initialize()
            native(bridge, 'original')
            entered = asyncio.Event()
            original_initialize, original_send = host.client.initialize, host.client.http.send
            async def blocked_initialize():
                entered.set()
                await asyncio.Future()
            async def blocked_wire(request, **kwargs):
                body = json.loads(request.content) if request.method == 'POST' else {}
                if body.get('params', {}).get('name') == 'smartplan_prepare_change':
                    entered.set()
                    await asyncio.Future()
                return await original_send(request, **kwargs)
            if boundary == 'initialize':
                host.client.initialize = blocked_initialize
            else:
                host.client.http.send = blocked_wire
            call = {'name':'smartplan_prepare_change','call_id':'cancelled-prepare',
                    'arguments':json.dumps({'operation':'pause','scenario_id':'scenario','expected_revision':7})}
            task = asyncio.create_task(host.result(call))
            await asyncio.wait_for(entered.wait(), 2)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            host.client.initialize, host.client.http.send = original_initialize, original_send
            with ports.session_factory() as db:
                row = db.scalars(select(SmartPlanDelivery)).one()
                assert (row.state,row.transport_state,row.voice_session_id) == ('cancelled_not_sent','not_sent','provider-one')
                original_key = row.request_key
                assert original_key.startswith('voice-') and row.input_event_id
            await host.result({**call,'call_id':'same-intent-repeat'})
            assert json.loads(bridge.sent[-1]['output'])['error']['code'] == 'smartplan_original_delivery_already_reserved_do_not_repeat'
            assert not any(body.get('params', {}).get('name') == 'smartplan_prepare_change' for _, body in fixture.calls)
            with ports.session_factory() as db:
                assert db.scalars(select(SmartPlanDelivery)).one().request_key == original_key
            await host.close()
    asyncio.run(run())


def test_actual_http_final_guard_drops_only_unsent_commit_keeps_shared_reader():
    async def run():
        fixture = Candidate()
        fixture.results['smartplan_open'] = {'error':{'code':'independent_read'}}
        fixture.results['smartplan_context'] = {'error':{'code':'independent_context'}}
        read_started, read_release = asyncio.Event(), asyncio.Event()
        async def transport(request):
            if request.method == 'POST':
                body = json.loads(request.content)
                if body.get('params', {}).get('name') == 'smartplan_open':
                    read_started.set()
                    await read_release.wait()
            return fixture(request)
        _, ports, bridge, host, _ = setup(fixture)
        ports = replace(ports,smartplan_transport=httpx.MockTransport(transport))
        with bind(ports):
            await host.client.close()
            host.client = SmartPlanClient('admin-profile:1')
            await host.client.initialize()
            native(bridge,'original')
            value = await host.execute('smartplan_prepare_change', {
                'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'original'})
            read = asyncio.create_task(host.client.call('smartplan_open',{'target':{'entity':'scenario','scenario_id':'scenario'}}))
            await read_started.wait()
            original_send = host.client.http.send
            obsolete = False
            def guard():
                if obsolete:
                    raise SmartError('cancelled_not_sent')
            bridge.assert_current_operation = guard
            async def final_edge(request,**kwargs):
                nonlocal obsolete
                body = json.loads(request.content) if request.method=='POST' else {}
                if body.get('params',{}).get('name')=='smartplan_commit':
                    obsolete = True
                return await original_send(request,**kwargs)
            host.client.http.send = final_edge
            with pytest.raises(SmartError, match='cancelled_not_sent'):
                await host.commit(value['proposal_id'])
            assert host.client.initialized and not host.client.session_task.done()
            assert not read.done()
            read_release.set()
            assert (await read)['error']['code']=='independent_read'
            assert (await host.client.call('smartplan_context',{}))['error']['code']=='independent_context'
            assert fixture.submissions == 0
            assert not any(body.get('params',{}).get('name')=='smartplan_commit' for _,body in fixture.calls)
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('effect,expected', [('none','rejected'),('prepared','uncertain'),('applied','uncertain'),('uncertain','uncertain')])
def test_canonical_nested_business_evidence_never_becomes_new_first_effect_permission(effect,expected):
    async def run():
        fixture = Candidate()
        original = fixture.__call__
        error = {'error':{'code':'proposal_not_found' if effect=='none' else 'application_failed',
                 'phase':'application','origin':'smartplan','effect_state':effect,
                 'retryable':False,'next_action':'query_original_operation',
                 'proposal_id':'candidate-proposal','operation_id':'candidate-proposal'}}
        def transport(request):
            if request.method=='POST':
                body = json.loads(request.content)
                if body.get('params',{}).get('name')=='smartplan_commit':
                    fixture.calls.append(('/mcp',body))
                    return httpx.Response(200,json={'jsonrpc':'2.0','id':body['id'],'result':{
                        'isError':True,'structuredContent':error,'content':[{'type':'text','text':json.dumps(error)}]}})
            return original(request)
        _, ports, bridge, host, _ = setup(fixture)
        ports = replace(ports,smartplan_transport=httpx.MockTransport(transport))
        with bind(ports):
            await host.client.close()
            host.client = SmartPlanClient('admin-profile:1')
            await host.client.initialize()
            native(bridge,'original')
            value = await host.execute('smartplan_prepare_change', {
                'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'original'})
            result = await host.commit(value['proposal_id'])
            assert result == error
            with ports.session_factory() as db:
                attempt = db.scalars(select(SmartPlanAuthorization)).one()
                assert attempt.state == expected and attempt.commit_transport == 'maybe_sent'
            native(bridge,'different-intent')
            if expected == 'rejected':
                with pytest.raises(SmartError,match='confirmation_required'):
                    await host.commit(value['proposal_id'])
                assert len([b for _,b in fixture.calls if b.get('params',{}).get('name')=='smartplan_commit']) == 1
            assert fixture.submissions == 0
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('status', [404, 'prepared', 'applied'])
def test_new_public_owner_status_can_resolve_unknown_without_authorizing_first_dispatch(status):
    from test_public_bridge import exported
    fixture = Candidate()
    fixture.contract = exported('smartplan_correction_contract.json')
    fixture.catalog = fixture.contract['tools']
    statuses = []
    original = fixture.__call__
    def transport(request):
        if request.method=='GET' and request.url.path.startswith('/host/proposals/'):
            statuses.append(request.url.path)
            assert request.headers['X-SmartPlan-Link']=='owner-link'
            if status==404:
                return httpx.Response(404,json={'error':{'code':'not_found'}})
            value={'proposal_id':'candidate-proposal','operation_id':'candidate-proposal','phase':status,
                'operation':'pause','fingerprint':'a'*64,'prepared_at':'2026-10-13T10:00:00Z',
                'expires_at':'2026-10-13T10:20:00Z','approved_at':None,
                'result':{'scenario_id':'scenario','revision':8,'status':'paused'} if status=='applied' else None,
                'first_dispatch_evidence':'unknown','status_is_authorization':False}
            return httpx.Response(200,json=value)
        return original(request)
    async def run():
        _,ports,bridge,host,_=setup(fixture)
        ports2=replace(ports,smartplan_transport=httpx.MockTransport(transport))
        with bind(ports2):
            await host.client.close()
            host.client=SmartPlanClient('admin-profile:1')
            await host.client.initialize()
            native(bridge,'original')
            value=await host.execute('smartplan_prepare_change',{
                'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'original'})
            with ports2.session_factory() as db:
                db.query(SmartPlanAuthorization).delete()
                row=db.scalars(select(SmartPlanReceipt)).one()
                row.state='uncertain'
                db.commit()
            bridge.id='restart'
            native(bridge,'not-consent-to-old')
            if status=='applied':
                result=await host.commit(value['proposal_id'])
                assert result=={'operation_id':'candidate-proposal','recovered_from_status':True,
                    'result':{'scenario_id':'scenario','revision':8,'status':'paused'}}
            else:
                with pytest.raises(SmartError,match='legacy_dispatch_unknown_no_replay'):
                    await host.commit(value['proposal_id'])
            assert statuses==['/host/proposals/candidate-proposal']
            assert fixture.submissions==0
            assert not any(b.get('params',{}).get('name')=='smartplan_commit' for _,b in fixture.calls)
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('modern',[False,True])
def test_queue_admission_failure_is_proven_unsent_not_recovery_authority(modern):
    async def run():
        _,ports,bridge,host,fixture=setup(Candidate() if modern else None)
        with bind(ports):
            native(bridge,'original')
            if modern:
                await host.client.initialize()
                value=await host.execute('smartplan_prepare_change',{'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'original'})
                proposal=value['proposal_id']
            else:
                await host.execute('smartplan_prepare',{'operation':'pause','scenario_id':'scenario','expected_revision':7})
                approve(bridge,host)
                proposal='server-proposal'
            original=host.client.requests.put_nowait
            def full(value):
                raise asyncio.QueueFull()
            host.client.requests.put_nowait=full
            with pytest.raises(SmartError,match='cancelled_not_sent'):
                await host.commit(proposal)
            host.client.requests.put_nowait=original
            native(bridge,'new-unrelated-intent')
            with pytest.raises(SmartError,match='confirmation_required'):
                await host.commit(proposal)
            with ports.session_factory() as db:
                a=db.scalars(select(SmartPlanAuthorization)).one()
                assert (a.state,a.commit_transport)==('cancelled_not_sent','not_sent')
            assert fixture.submissions==0
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('state',['completed','uncertain'])
@pytest.mark.parametrize('reconnect',[False,True])
def test_duplicate_delivery_preserves_original_completed_or_uncertain_evidence(state,reconnect):
    async def run():
        _,ports,bridge,host,fixture=setup(Candidate())
        with bind(ports):
            native(bridge,'original')
            call={'name':'smartplan_prepare_change','arguments':json.dumps({
                'operation':'pause','scenario_id':'scenario','expected_revision':7}),'call_id':'original-call'}
            await host.result(call)
            with ports.session_factory() as db:
                row=db.scalars(select(SmartPlanDelivery)).one()
                row.state=state
                db.commit()
            with ports.session_factory() as db:
                before=dict(db.execute(select(SmartPlanDelivery.__table__)).mappings().one())
            if reconnect:
                bridge.id='new-provider-session'
                await host.client.close()
                host.client=SmartPlanClient('admin-profile:1')
                await host.client.initialize()
            await host.result({**call,'call_id':'duplicate-provider-call'})
            assert json.loads(bridge.sent[-1]['output'])['error']['code']=='smartplan_original_delivery_already_reserved_do_not_repeat'
            with ports.session_factory() as db:
                after=dict(db.execute(select(SmartPlanDelivery.__table__)).mappings().one())
            assert before==after
            assert after['state']==state and after['voice_session_id']=='provider-one'
            assert len([b for _,b in fixture.calls if b.get('params',{}).get('name')=='smartplan_prepare_change'])==1
            assert fixture.submissions==0
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('effect,phase,expected', [('none','application','rejected'),
    ('prepared','output','prepared'),('applied','output','applied'),('uncertain','application','uncertain')])
def test_delivery_canonical_nested_effect_and_original_status_ids_are_preserved(effect,phase,expected):
    from test_public_bridge import exported
    fixture=Candidate()
    fixture.contract=exported('smartplan_correction_contract.json')
    fixture.catalog=fixture.contract['tools']
    original=fixture.__call__
    error={'error':{'code':'output_failed','phase':phase,'origin':'smartplan','effect_state':effect,
        'retryable':False,'next_action':'inspect_original_operation_without_reissuing_mutation',
        'proposal_id':'stored-original-proposal','operation_id':'stored-original-operation',
        'correlation_id':'stored-original-correlation'}}
    def transport(request):
        if request.method=='POST':
            body=json.loads(request.content)
            if body.get('params',{}).get('name')=='smartplan_prepare_change':
                fixture.calls.append(('/mcp',body))
                return httpx.Response(200,json={'jsonrpc':'2.0','id':body['id'],'result':{
                    'isError':True,'structuredContent':error,'content':[{'type':'text','text':json.dumps(error)}]}})
        return original(request)
    async def run():
        _,ports,bridge,host,_=setup(fixture)
        ports=replace(ports,smartplan_transport=httpx.MockTransport(transport))
        with bind(ports):
            await host.client.close()
            host.client=SmartPlanClient('admin-profile:1')
            native(bridge,'original')
            call={'name':'smartplan_prepare_change','call_id':'original','arguments':json.dumps({
                'operation':'pause','scenario_id':'scenario','expected_revision':7})}
            await host.result(call)
            assert json.loads(bridge.sent[-1]['output'])==error
            with ports.session_factory() as db:
                row=db.scalars(select(SmartPlanDelivery)).one()
                assert (row.state,row.transport_state)==(expected,'maybe_sent')
                assert (row.proposal_id,row.operation_id,row.correlation_id)==(
                    'stored-original-proposal','stored-original-operation','stored-original-correlation')
                key=row.request_key
                assert key.startswith('voice-')
            await host.result({**call,'call_id':'duplicate'})
            with ports.session_factory() as db:
                row=db.scalars(select(SmartPlanDelivery)).one()
                assert (row.state,row.request_key,row.proposal_id)==(expected,key,'stored-original-proposal')
            assert len([b for _,b in fixture.calls if b.get('params',{}).get('name')=='smartplan_prepare_change'])==1
            assert fixture.submissions==0
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('exception',[ValueError,TypeError])
def test_post_effect_host_construction_failure_keeps_original_delivery_ids(exception):
    async def run():
        _,ports,bridge,host,fixture=setup(Candidate())
        with bind(ports):
            native(bridge,'original')
            original=host.execute
            async def fault(name,args,**kwargs):
                await original(name,args,**kwargs)
                raise exception('synthetic post-result construction failure')
            host.execute=fault
            await host.result({'name':'smartplan_prepare_change','call_id':'stored-before-construction',
                'arguments':json.dumps({'operation':'pause','scenario_id':'scenario','expected_revision':7})})
            error=json.loads(bridge.sent[-1]['output'])['error']
            assert error['code']=='smartplan_delivery_uncertain_use_original_identity'
            assert error['effect_state']=='uncertain' and error['proposal_id']=='candidate-proposal'
            with ports.session_factory() as db:
                row=db.scalars(select(SmartPlanDelivery)).one()
                assert (row.state,row.transport_state,row.proposal_id)==('uncertain','maybe_sent','candidate-proposal')
                assert row.request_key==error['request_key']
            assert len([b for _,b in fixture.calls if b.get('params',{}).get('name')=='smartplan_prepare_change'])==1
            assert fixture.submissions==0
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('arguments',['{',json.dumps({'operation':'unsupported'})])
def test_pre_reservation_parse_and_shape_failure_has_no_journal_or_dispatch(arguments):
    async def run():
        _,ports,bridge,host,fixture=setup(Candidate())
        with bind(ports):
            native(bridge,'original')
            await host.result({'name':'smartplan_prepare_change','call_id':'invalid','arguments':arguments})
            assert json.loads(bridge.sent[-1]['output'])['error']['code']=='invalid_smartplan_arguments'
            with ports.session_factory() as db:
                assert db.scalars(select(SmartPlanDelivery)).all()==[]
            assert not any(b.get('method')=='tools/call' for _,b in fixture.calls)
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('phase',['modern_init','legacy_confirm','legacy_after_confirm_init'])
def test_not_sent_error_phase_follows_actual_confirm_transport_evidence(phase):
    async def run():
        modern=phase=='modern_init'
        _,ports,bridge,host,fixture=setup(Candidate() if modern else None)
        with bind(ports):
            native(bridge,'original')
            if modern:
                await host.client.initialize()
                value=await host.execute('smartplan_prepare_change',{'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'original'})
                proposal=value['proposal_id']
            else:
                await host.execute('smartplan_prepare',{'operation':'pause','scenario_id':'scenario','expected_revision':7})
                approve(bridge,host)
                proposal='server-proposal'
            original=host.client.initialize
            async def unavailable():
                raise SmartError('smartplan_unavailable')
            if phase=='legacy_confirm':
                fixture.fail_after_confirm=True
            else:
                host.client.initialize=unavailable
            expected='smartplan_confirm_uncertain_commit_not_sent' if phase=='legacy_confirm' else 'smartplan_commit_not_sent_current_authorization_only'
            with pytest.raises(SmartError,match=expected):
                await host.commit(proposal)
            host.client.initialize=original
            with ports.session_factory() as db:
                a=db.scalars(select(SmartPlanAuthorization)).one()
                assert a.commit_transport=='not_sent' and a.state=='not_sent'
                assert a.confirm_transport=={'modern_init':'not_sent','legacy_confirm':'maybe_sent','legacy_after_confirm_init':'acknowledged'}[phase]
            native(bridge,'new-unrelated-intent')
            with pytest.raises(SmartError,match='confirmation_required'):
                await host.commit(proposal)
            assert fixture.submissions==0
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('modern',[False,True])
def test_trusted_http_auth_rejection_cannot_grant_first_effect_recovery(modern):
    async def run():
        fixture=Candidate() if modern else None
        _,ports,bridge,host,fixture=setup(fixture)
        deny=False
        original_transport=fixture.__call__
        def transport(request):
            body=json.loads(request.content) if request.method=='POST' else {}
            if deny and (request.url.path=='/host/confirm' or body.get('params',{}).get('name')=='smartplan_commit'):
                return httpx.Response(403)
            return original_transport(request)
        ports=replace(ports,smartplan_transport=httpx.MockTransport(transport))
        with bind(ports):
            await host.client.close()
            host.client=SmartPlanClient('admin-profile:1')
            native(bridge,'original')
            if modern:
                await host.client.initialize()
                value=await host.execute('smartplan_prepare_change',{'operation':'pause','scenario_id':'scenario','expected_revision':7,'request_key':'original'})
                proposal=value['proposal_id']
            else:
                await host.execute('smartplan_prepare',{'operation':'pause','scenario_id':'scenario','expected_revision':7})
                approve(bridge,host)
                proposal='server-proposal'
            deny=True
            with pytest.raises(SmartError,match='access_denied'):
                await host.commit(proposal)
            with ports.session_factory() as db:
                a=db.scalars(select(SmartPlanAuthorization)).one()
                assert a.state=='rejected'
                assert a.commit_transport==('maybe_sent' if modern else 'not_sent')
            assert not host.client.metadata_available
            deny=False
            await host.client.initialize()
            native(bridge,'not-new-consent-for-old')
            with pytest.raises(SmartError,match='confirmation_required'):
                await host.commit(proposal)
            assert fixture.submissions==0
            await host.close()
    asyncio.run(run())
