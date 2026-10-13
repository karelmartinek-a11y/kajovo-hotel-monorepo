"""Same-call capability recovery uses fresh transport, public metadata and host ACK."""
import asyncio
import copy
import json
from dataclasses import replace
from types import SimpleNamespace
import httpx
import pytest
from voice_core_server import VoiceCoreConfig
from dagmar_server.orchestration import VoiceBridge
from dagmar_server.ports import bind
from dagmar_server.public_contract import PublicContract, digest
from dagmar_server.smart import SmartError
from dagmar_server.smartplan_storage import SmartPlanDelivery
from test_smartplan import setup
from test_public_bridge import Candidate, exported


@pytest.mark.parametrize('failure', ['initial','refresh_same','refresh_changed'])
def test_same_call_transient_reconnect_requires_fresh_exact_ack_preserves_other_capability(failure):
    async def run():
        fixture = Candidate()
        fixture.results['smartplan_context'] = {'error':{'code':'synthetic_context'}}
        initial_left = 2 if failure == 'initial' else 0
        refresh_failed = False
        initialized = 0
        reconnect_started, recovered, ack_release = asyncio.Event(), asyncio.Event(), asyncio.Event()
        async def transport(request):
            nonlocal initial_left, refresh_failed, initialized
            body = json.loads(request.content) if request.method == 'POST' else {}
            if body.get('method') == 'initialize':
                initialized += 1
                if initial_left:
                    initial_left -= 1
                    return httpx.Response(503)
            if request.method == 'GET' and request.url.path == '/contract' and recovered.is_set() and not refresh_failed and failure != 'initial':
                refresh_failed = True
                if failure == 'refresh_changed':
                    fixture.contract = copy.deepcopy(fixture.contract)
                    fixture.contract['instructions'] += '\nPublic correction guidance.'
                    fixture.contract['sha256'] = digest({k:v for k,v in fixture.contract.items() if k != 'sha256'})
                return httpx.Response(503)
            return fixture(request)
        _, ports, _, original_host, _ = setup(fixture)
        ports = replace(ports, smartplan_transport=httpx.MockTransport(transport),
            settings=ports.settings.model_copy(update={'voice_metadata_refresh_seconds':0.01}))
        with bind(ports):
            await original_host.close()
            bridge = VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            bridge.logical_call_id = 'logical-call'
            ha = PublicContract(exported('ha_candidate_contract.json'), profiles={'ha-smart/2.1':'smart/2'}).project()
            bridge.mcp = SimpleNamespace(metadata_available=True, model_projection=ha)
            bridge.catalog_ready = True
            bridge.smartplan.retry_initial_seconds = 0.01
            bridge.smartplan.retry_max_seconds = 0.02
            updates = []
            prior_client = None
            async def item(value):
                pass
            async def ack(event, match):
                nonlocal prior_client
                updates.append(event)
                client = bridge.smartplan.client
                if bridge.smartplan.status == 'ready':
                    if recovered.is_set() and client is not prior_client:
                        reconnect_started.set()
                        await ack_release.wait()
                    prior_client = client
                    recovered.set()
                return {'type':'session.updated','event_id':'fixture-ack-'+str(len(updates)), 'session':event['session']}
            bridge.item, bridge.send = item, ack
            with ports.session_factory() as db:
                db.add(SmartPlanDelivery(id='sent-before-outage', subject='admin-profile:1',logical_call_id='logical-call',
                    tool='smartplan_prepare_change', arguments_digest='a'*64,state='uncertain',
                    transport_state='maybe_sent',proposal_id='original-proposal',request_key='original-request'))
                db.commit()
            task = asyncio.create_task(bridge.smartplan.initialize())
            await asyncio.wait_for(recovered.wait(),3)
            if failure != 'initial':
                await asyncio.wait_for(reconnect_started.wait(),3)
                assert bridge.smartplan.status == 'ready'
                assert 'smartplan' not in bridge.contract_acknowledgements
                bridge.require_contract_ack('ha')
                with pytest.raises(SmartError, match='unacknowledged'):
                    await bridge.smartplan.execute('smartplan_context',{})
                assert not any(body.get('method')=='tools/call' for _,body in fixture.calls)
                ack_release.set()
            async with asyncio.timeout(3):
                while 'smartplan' not in bridge.contract_acknowledgements:
                    await asyncio.sleep(0)
            bridge.require_contract_ack('smartplan')
            result = await bridge.smartplan.execute('smartplan_context',{})
            assert result['error']['code'] == 'synthetic_context'
            assert initialized == (3 if failure == 'initial' else 2)
            assert bridge.smartplan.client.metadata_available
            assert bridge.contract_acknowledgements['smartplan']['metadata_digest'] == fixture.contract['sha256']
            assert len([body for _,body in fixture.calls if body.get('method')=='tools/call']) == 1
            with ports.session_factory() as db:
                row = db.get(SmartPlanDelivery,'sent-before-outage')
                assert (row.state,row.proposal_id,row.request_key,row.transport_state) == ('uncertain','original-proposal','original-request','maybe_sent')
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            assert bridge.smartplan.client.session_task is None
    asyncio.run(run())


@pytest.mark.parametrize('code', [401,403])
def test_access_denied_is_terminal_until_repaired_never_retries_or_dispatches(code):
    async def run():
        fixture = Candidate()
        initializations = 0
        async def transport(request):
            nonlocal initializations
            body = json.loads(request.content) if request.method == 'POST' else {}
            if body.get('method') == 'initialize':
                initializations += 1
            if request.method == 'GET' and request.url.path == '/contract':
                return httpx.Response(code)
            return fixture(request)
        _, ports, bridge, host, _ = setup(fixture)
        ports = replace(ports, smartplan_transport=httpx.MockTransport(transport))
        bridge.catalog_ready = True
        paused = asyncio.Event()
        async def configure(enabled):
            if host.status == 'unavailable':
                paused.set()
        bridge.configure = configure
        host.retry_initial_seconds = 0.01
        with bind(ports):
            await host.close()
            task = asyncio.create_task(host.initialize())
            await asyncio.wait_for(paused.wait(),2)
            await asyncio.sleep(0.05)
            assert initializations == 1 and host.status == 'unavailable'
            assert not host.client.metadata_available
            assert not any(body.get('method')=='tools/call' for _,body in fixture.calls)
            task.cancel()
            await asyncio.gather(task,return_exceptions=True)
    asyncio.run(run())


def test_call_end_cancels_backoff_without_additional_attempt():
    async def run():
        attempts, started = 0, asyncio.Event()
        async def transport(request):
            nonlocal attempts
            if request.method == 'POST':
                body = json.loads(request.content)
                if body.get('method') == 'initialize':
                    attempts += 1
                    started.set()
                    return httpx.Response(503)
            return httpx.Response(405)
        _, ports, bridge, host, _ = setup()
        ports = replace(ports,smartplan_transport=httpx.MockTransport(transport))
        bridge.catalog_ready = True
        async def configure(enabled):
            pass
        bridge.configure = configure
        host.retry_initial_seconds = 1
        with bind(ports):
            await host.close()
            task = asyncio.create_task(host.initialize())
            await asyncio.wait_for(started.wait(),2)
            await asyncio.sleep(0.02)
            task.cancel()
            await asyncio.wait_for(asyncio.gather(task,return_exceptions=True),1)
            await asyncio.sleep(0.03)
            assert attempts == 1 and host.status == 'unavailable'
    asyncio.run(run())


def test_provider_rejection_and_cleanup_failure_do_not_kill_retry_or_enable_before_ack():
    async def run():
        fixture=Candidate()
        _,ports,_,old,_=setup(fixture)
        with bind(ports):
            await old.close()
            bridge=VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            bridge.catalog_ready=False
            bridge.smartplan.retry_initial_seconds=0.01
            accepted=asyncio.Event()
            events=[]
            async def ack(event,match):
                events.append(event)
                if len(events)<=2:
                    raise SmartError('provider_configuration_rejected')
                accepted.set()
                return {'type':'session.updated','event_id':'fresh-after-rejection','session':event['session']}
            bridge.send=ack
            task=asyncio.create_task(bridge.smartplan.initialize())
            await asyncio.wait_for(accepted.wait(),3)
            async with asyncio.timeout(2):
                while 'smartplan' not in bridge.contract_acknowledgements:
                    await asyncio.sleep(0)
            bridge.require_contract_ack('smartplan')
            assert len([b for _,b in fixture.calls if b.get('method')=='initialize'])==2
            assert not any(b.get('method')=='tools/call' for _,b in fixture.calls)
            await bridge.smartplan.close()
            await asyncio.gather(task,return_exceptions=True)
    asyncio.run(run())


def test_initialize_deadline_and_singleflight_are_owned_by_the_capability(monkeypatch):
    from dagmar_server.smartplan import SmartPlanClient
    monkeypatch.setattr(SmartPlanClient,'initialization_timeout_seconds',0.03)
    async def run():
        fixture=Candidate()
        attempts=0
        blocked,ready=asyncio.Event(),asyncio.Event()
        async def transport(request):
            nonlocal attempts
            body=json.loads(request.content) if request.method=='POST' else {}
            if body.get('method')=='initialize':
                attempts+=1
                if attempts==1:
                    SmartPlanClient.initialization_timeout_seconds=35
                    blocked.set()
                    await asyncio.Future()
            return fixture(request)
        _,ports,bridge,host,_=setup(fixture)
        ports=replace(ports,smartplan_transport=httpx.MockTransport(transport))
        bridge.catalog_ready=True
        async def configure(enabled):
            if host.status=='ready':
                ready.set()
        bridge.configure=configure
        host.retry_initial_seconds=0.01
        with bind(ports):
            await host.close()
            first=asyncio.create_task(host.initialize())
            await blocked.wait()
            second=asyncio.create_task(host.initialize())
            await asyncio.wait_for(ready.wait(),3)
            assert attempts==2
            await host.close()
            await asyncio.wait_for(asyncio.gather(first,second,return_exceptions=True),1)
            assert attempts==2 and host.lifecycle_task is None
    asyncio.run(run())


@pytest.mark.parametrize('defect',['integrity','credential_echo','unknown_profile'])
def test_untrusted_contract_failure_never_becomes_transient_retry(defect):
    async def run():
        fixture=Candidate()
        if defect=='integrity':
            fixture.contract=copy.deepcopy(fixture.contract)
            fixture.contract['sha256']='0'*64
        elif defect=='credential_echo':
            fixture.contract=copy.deepcopy(fixture.contract)
            fixture.contract['instructions']='synthetic-voice-token-not-real'
        else:
            fixture.contract=copy.deepcopy(fixture.contract)
            fixture.contract['compatibility_profile']='unknown-breaking-profile'
            fixture.contract['sha256']=digest({k:v for k,v in fixture.contract.items() if k!='sha256'})
        _,ports,bridge,host,_=setup(fixture)
        bridge.catalog_ready=True
        paused=asyncio.Event()
        async def configure(enabled):
            if host.status=='unavailable':
                paused.set()
        bridge.configure=configure
        host.retry_initial_seconds=0.01
        with bind(ports):
            await host.close()
            task=asyncio.create_task(host.initialize())
            await asyncio.wait_for(paused.wait(),2)
            await asyncio.sleep(0.05)
            assert len([b for _,b in fixture.calls if b.get('method')=='initialize'])==1
            assert host.status=='unavailable' and not host.client.metadata_available
            assert not any(b.get('method')=='tools/call' for _,b in fixture.calls)
            await host.close()
            await asyncio.gather(task,return_exceptions=True)
    asyncio.run(run())


def test_midcall_sdk_transport_failure_invalidates_immediately_and_reconnects_without_refresh_sleep():
    async def run():
        fixture=Candidate()
        fixture.results['smartplan_context']={'error':{'code':'synthetic_context'}}
        failed=False
        async def transport(request):
            nonlocal failed
            body=json.loads(request.content) if request.method=='POST' else {}
            if body.get('params',{}).get('name')=='smartplan_context' and not failed:
                failed=True
                raise httpx.ReadError('synthetic transport lifetime ended')
            return fixture(request)
        _,ports,_,old,_=setup(fixture)
        ports=replace(ports,smartplan_transport=httpx.MockTransport(transport))
        with bind(ports):
            await old.close()
            bridge=VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            bridge.catalog_ready=False
            bridge.smartplan.retry_initial_seconds=0.01
            ready,reconnect,release=asyncio.Event(),asyncio.Event(),asyncio.Event()
            first_client=None
            async def ack(event,match):
                nonlocal first_client
                if bridge.smartplan.status=='ready':
                    if first_client is None:
                        first_client=bridge.smartplan.client
                        ready.set()
                    else:
                        reconnect.set()
                        await release.wait()
                return {'type':'session.updated','event_id':'transport-ack','session':event['session']}
            bridge.send=ack
            task=asyncio.create_task(bridge.smartplan.initialize())
            await asyncio.wait_for(ready.wait(),3)
            async with asyncio.timeout(2):
                while 'smartplan' not in bridge.contract_acknowledgements:
                    await asyncio.sleep(0)
            old_session=first_client.transport_session_id
            with pytest.raises(SmartError):
                await bridge.smartplan.execute('smartplan_context',{})
            async with asyncio.timeout(2):
                while first_client.metadata_available:
                    await asyncio.sleep(0)
            assert first_client.projection is None
            assert 'smartplan' not in bridge.contract_acknowledgements
            await asyncio.wait_for(reconnect.wait(),3)
            assert bridge.smartplan.client is not first_client
            assert bridge.smartplan.client.transport_session_id != old_session
            # A host-managed failed client cannot reconnect itself under old ACK.
            before=len([b for _,b in fixture.calls if b.get('method')=='initialize'])
            with pytest.raises(SmartError,match='unavailable'):
                await first_client.call('smartplan_context',{})
            with pytest.raises(SmartError,match='unacknowledged'):
                await bridge.smartplan.execute('smartplan_context',{})
            assert len([b for _,b in fixture.calls if b.get('method')=='initialize'])==before
            release.set()
            async with asyncio.timeout(2):
                while 'smartplan' not in bridge.contract_acknowledgements:
                    await asyncio.sleep(0)
            assert (await bridge.smartplan.execute('smartplan_context',{}))['error']['code']=='synthetic_context'
            assert bridge.contract_acknowledgements['smartplan']['transport_session_id']==bridge.smartplan.client.transport_session_id
            await bridge.smartplan.close()
            await asyncio.gather(task,return_exceptions=True)
    asyncio.run(run())


def test_same_client_new_sdk_session_requires_fresh_ack_and_rejects_old_inflight_ack():
    async def run():
        _,ports,_,old,_=setup(Candidate())
        with bind(ports):
            bridge=VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            bridge.smartplan.client=old.client
            client=old.client
            await client.initialize()
            bridge.smartplan.status='ready'
            updates=[]
            entered,release=asyncio.Event(),asyncio.Event()
            async def ack(event,match):
                updates.append(event)
                if len(updates)>1:
                    entered.set()
                    await release.wait()
                return {'type':'session.updated','event_id':'ack-'+str(len(updates)),'session':event['session']}
            bridge.send=ack
            await bridge.configure(False)
            original=client.transport_session_id
            client.session_task.cancel()
            await asyncio.gather(client.session_task,return_exceptions=True)
            assert not client.metadata_available
            await client.initialize()
            assert client.transport_session_id != original
            with pytest.raises(SmartError,match='unacknowledged'):
                bridge.require_contract_ack('smartplan')
            pending=asyncio.create_task(bridge.configure(False))
            await entered.wait()
            # Replace SDK session while ACK for the preceding session is in flight.
            client.session_task.cancel()
            await asyncio.gather(client.session_task,return_exceptions=True)
            await client.initialize()
            release.set()
            await pending
            assert 'smartplan' not in bridge.contract_acknowledgements
            with pytest.raises(SmartError,match='unacknowledged'):
                bridge.require_contract_ack('smartplan')
            assert 'tools' in updates[-1]['session']
            await bridge.configure(False)
            bridge.require_contract_ack('smartplan')
            assert bridge.contract_acknowledgements['smartplan']['transport_session_id']==client.transport_session_id
            await old.close()
    asyncio.run(run())


def test_late_old_ack_cannot_erase_newer_matching_transport_ack():
    async def run():
        _,ports,_,old,_=setup(Candidate())
        with bind(ports):
            bridge=VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            client=old.client
            await client.initialize()
            bridge.smartplan.client=client
            bridge.smartplan.status='ready'
            async def ack(event,match):
                return {'type':'session.updated','event_id':'current-session-ack','session':event['session']}
            bridge.send=ack
            await bridge.configure(False)
            stale=bridge.contract_provenance(False)
            client.session_task.cancel()
            await asyncio.gather(client.session_task,return_exceptions=True)
            await client.initialize()
            await bridge.configure(False)
            current=dict(bridge.contract_acknowledgements['smartplan'])
            assert current['transport_session_id']!=stale['smartplan']['transport_session_id']
            bridge.record_contract_acknowledgements(stale,'late-old-session-ack')
            assert bridge.contract_acknowledgements['smartplan']==current
            bridge.require_contract_ack('smartplan')
            await old.close()
    asyncio.run(run())


@pytest.mark.parametrize('code',[401,403])
@pytest.mark.parametrize('stage',['initialize','tool'])
def test_actual_sdk_auth_status_closes_scope_without_transient_retry(code,stage):
    async def run():
        fixture=Candidate()
        ready,paused=asyncio.Event(),asyncio.Event()
        initializations=0
        async def transport(request):
            nonlocal initializations
            body=json.loads(request.content) if request.method=='POST' else {}
            if body.get('method')=='initialize':
                initializations+=1
                if stage=='initialize':
                    return httpx.Response(code)
            if body.get('method')=='tools/call' and stage=='tool':
                return httpx.Response(code)
            return fixture(request)
        _,ports,bridge,host,_=setup(fixture)
        ports=replace(ports,smartplan_transport=httpx.MockTransport(transport))
        bridge.catalog_ready=True
        async def configure(enabled):
            if host.status=='ready':
                ready.set()
            else:
                paused.set()
        bridge.configure=configure
        host.retry_initial_seconds=0.01
        with bind(ports):
            await host.close()
            task=asyncio.create_task(host.initialize())
            if stage=='tool':
                await asyncio.wait_for(ready.wait(),3)
                with pytest.raises(SmartError,match='access_denied'):
                    await host.execute('smartplan_context',{})
            await asyncio.wait_for(paused.wait(),3)
            await asyncio.sleep(0.05)
            assert initializations==1 and host.status=='unavailable'
            assert not host.client.metadata_available and host.client.projection is None
            assert host.last_error=='smartplan_access_denied'
            await host.close()
            await asyncio.gather(task,return_exceptions=True)
    asyncio.run(run())
