"""Existing authenticated sessions fail closed when canonical metadata disappears."""
import asyncio
import copy
import json
from contextlib import asynccontextmanager
from dataclasses import replace
from types import SimpleNamespace

import httpx
import pytest
from voice_core_server import VoiceCoreConfig

from dagmar_server import smart
from dagmar_server.orchestration import VoiceBridge
from dagmar_server.ports import bind
from dagmar_server.public_contract import PublicContract
from dagmar_server.smart import SmartError
from dagmar_server.smartplan import RECOMMENDED
from test_public_bridge import Candidate, exported
from test_smartplan import Fixture, setup


class HA:
    def __init__(self, legacy=False):
        self.contract = exported('ha_live_contract.json' if legacy else 'ha_candidate_contract.json')
        self.status = 405 if legacy else 200
        self.calls = []
        self.started, self.release = asyncio.Event(), asyncio.Event()
        self.hold = False

    async def __call__(self, request):
        if request.method == 'GET':
            if request.url.params.get('contract') == '1':
                return httpx.Response(self.status, json=self.contract if self.status == 200 else {})
            return httpx.Response(405)
        if request.method == 'DELETE':
            return httpx.Response(200)
        body = json.loads(request.content)
        if 'id' not in body:
            return httpx.Response(202)
        if body['method'] == 'initialize':
            value = {'protocolVersion':'2025-03-26','capabilities':{'tools':{}},
                     'serverInfo':self.contract.get('serverInfo',{'name':'KajaVoiceHA','version':'2.1.25'}),
                     'instructions':self.contract['instructions']}
        elif body['method'] == 'tools/list':
            value = {'tools':self.contract['tools']}
        else:
            assert body['method'] == 'tools/call'
            self.calls.append(body['params']['arguments'])
            if self.hold:
                self.started.set()
                await self.release.wait()
            output = {'catalog_revision':'synthetic-revision','observed_at':'2026-10-13T12:00:00Z',
                      'results':[], 'contract_version':'smart/2',
                      'guidance_version':self.contract['guidance_version'],'contract_sha256':self.contract['sha256']}
            value = {'structuredContent':output,'content':[{'type':'text','text':json.dumps(output)}]}
        return httpx.Response(200,json={'jsonrpc':'2.0','id':body['id'],'result':value})


@pytest.mark.parametrize('missing',[404,405])
@pytest.mark.parametrize('legacy',[False,True])
def test_ha_existing_session_missing_export_pauses_only_canonical(legacy,missing,monkeypatch):
    async def run():
        _,ports,_,host,_ = setup()
        fixture = HA(legacy)
        original_client = httpx.AsyncClient
        monkeypatch.setattr(smart.httpx,'AsyncClient',lambda **kwargs: original_client(
            **kwargs,transport=httpx.MockTransport(fixture)))
        ports = replace(ports,settings=ports.settings.model_copy(update={
            'ha_mcp_url':'https://devices.portable.test/mcp',
            'ha_trusted_origins':('https://devices.portable.test',)}))
        with bind(ports):
            async with smart.mcp_connection('synthetic-ha-credential') as client:
                contract,projection = client.public_contract,copy.deepcopy(client.model_projection)
                assert projection['compatibility_profile'] == ('ha-smart-known-2025' if legacy else 'ha-smart/2.1')
                await smart.call_smart(client,{'operation':'catalog'})
                if not legacy:
                    fixture.hold = True
                    # A sent request remains validatable under its original contract.
                    sent = asyncio.create_task(smart.call_smart(client,{'operation':'operation_status','request_id':'original-ha-id'}))
                    await fixture.started.wait()
                fixture.status = missing
                if legacy:
                    assert await client.refresh_metadata() is False
                    assert client.metadata_available and client.model_projection == projection
                    await smart.call_smart(client,{'operation':'catalog'})
                    assert len(fixture.calls) == 2
                else:
                    with pytest.raises(SmartError,match='mcp_incompatible'):
                        await client.refresh_metadata()
                    assert not client.metadata_available and client.model_projection is None
                    assert client.public_contract is contract
                    count = len(fixture.calls)
                    for dispatch in (smart.call_smart(client,{'operation':'catalog'}),
                                     client.call_tool('smart_technologie',{'operation':'catalog'})):
                        with pytest.raises(SmartError,match='mcp_incompatible'):
                            await dispatch
                    assert len(fixture.calls) == count
                    fixture.release.set()
                    result = await sent
                    assert result.structuredContent['catalog_revision']=='synthetic-revision'
                    assert fixture.calls[-1]['request_id']=='original-ha-id'
            await host.close()
    asyncio.run(run())


class MissingSP(Candidate):
    def __init__(self):
        super().__init__()
        self.export_status = 200

    def __call__(self,request):
        if request.method == 'GET' and request.url.path == '/contract':
            return httpx.Response(self.export_status,json=self.contract if self.export_status==200 else {})
        return super().__call__(request)


@pytest.mark.parametrize('missing',[404,405])
def test_smartplan_existing_session_invalidates_queued_work_preserves_sent_original(missing):
    async def run():
        fixture = MissingSP()
        started,release = asyncio.Event(),asyncio.Event()
        async def transport(request):
            if request.method=='POST':
                body = json.loads(request.content)
                if body.get('params',{}).get('name')=='smartplan_commit':
                    started.set()
                    await release.wait()
            return fixture(request)
        _,ports,_,host,_ = setup(fixture)
        ports = replace(ports,smartplan_transport=httpx.MockTransport(transport))
        from dagmar_server.smartplan import SmartPlanClient
        with bind(ports):
            await host.client.close()
            client = host.client = SmartPlanClient('admin-profile:1')
            await client.initialize()
            original_contract = client.contract
            sent = asyncio.create_task(client.call('smartplan_commit',{'proposal_id':'original-proposal'}))
            await started.wait()
            # Enqueue without yielding: metadata loss is observed before dispatch.
            queued = asyncio.get_running_loop().create_future()
            client.requests.put_nowait(('smartplan_context',{},queued,None))
            fixture.export_status = missing
            with pytest.raises(SmartError,match='smartplan_incompatible'):
                await client.refresh_metadata()
            with pytest.raises(SmartError,match='smartplan_incompatible'):
                await queued
            with pytest.raises(SmartError,match='smartplan_incompatible'):
                await client.call('smartplan_context',{})
            assert not client.metadata_available and client.projection is None
            assert client.contract is original_contract and client.initialized and not client.session_task.done()
            assert not any(body.get('params',{}).get('name')=='smartplan_context' for _,body in fixture.calls)
            release.set()
            result = await sent
            assert result['operation_id']=='original-operation'
            assert list(fixture.commits)==['original-proposal'] and fixture.submissions==1
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('missing',[404,405])
def test_smartplan_known_legacy_missing_export_keeps_verified_projection(missing):
    class Old(Fixture):
        def __init__(self):
            super().__init__()
            self.raw = exported('smartplan_live_contract.json')
            self.catalog = self.raw['tools']
        def __call__(self,request):
            if request.method=='GET':
                return httpx.Response(missing)
            body = json.loads(request.content)
            if body.get('method')=='initialize':
                return httpx.Response(200,json={'jsonrpc':'2.0','id':body['id'],'result':{
                    'serverInfo':{'name':'SmartPlan','version':self.raw['implementation_version']},
                    'instructions':self.raw['instructions'],'protocolVersion':'2025-03-26','capabilities':{'tools':{}}}})
            return super().__call__(request)
    async def run():
        _,ports,_,host,_ = setup(Old())
        with bind(ports):
            await host.client.initialize()
            projection = copy.deepcopy(host.client.projection)
            assert projection['compatibility_profile']=='smartplan-known-2025'
            assert await host.client.refresh_metadata() is False
            assert host.client.metadata_available and host.client.projection == projection
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('capability',['ha','smartplan'])
def test_late_provider_ack_cannot_restore_invalidated_capability(capability):
    async def run():
        _,ports,_,host,_ = setup()
        with bind(ports):
            bridge = VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            bridge.catalog_ready = True
            ha = PublicContract(exported('ha_candidate_contract.json'),profiles={'ha-smart/2.1':'smart/2'}).project()
            sp = PublicContract(exported('smartplan_candidate_contract.json'),
                                profiles={'smartplan-navigation-1-2025-v2':'navigation/1'}).project(recommended=RECOMMENDED)
            bridge.mcp = SimpleNamespace(model_projection=ha,metadata_available=True)
            bridge.smartplan.client = SimpleNamespace(projection=sp,metadata_available=True)
            bridge.smartplan.status = 'ready'
            client = bridge.mcp if capability=='ha' else bridge.smartplan.client
            other = 'smartplan' if capability=='ha' else 'ha'
            async def accepted(event,match):
                # Canonical export vanished while session.updated was in flight.
                client.metadata_available = False
                if capability=='ha':
                    client.model_projection = None
                    bridge.catalog_ready = False
                else:
                    client.projection = None
                    bridge.smartplan.status = 'unavailable'
                bridge.contract_acknowledgements.pop(capability,None)
                return {'type':'session.updated','event_id':'late-provider-ack','session':event['session']}
            bridge.send = accepted
            await bridge.configure(True)
            assert capability not in bridge.contract_acknowledgements
            assert bridge.contract_acknowledgements[other]['provider_event_id']=='late-provider-ack'
            sent = []
            async def paused(event,match):
                sent.append(event)
                return {'type':'session.updated','event_id':'paused-provider-ack','session':event['session']}
            bridge.send = paused
            await bridge.configure(bridge.catalog_ready)
            names = [tool['name'] for tool in sent[-1]['session']['tools']]
            assert 'assistant_memory' in names
            assert ('smart_technologie' in names) is (capability!='ha')
            assert ('smartplan_context' in names) is (capability!='smartplan')
            await host.close()
    asyncio.run(run())


def test_ha_refresh_pauses_before_slow_connection_cleanup_and_preserves_other_capability():
    async def run():
        _,ports,_,host,_ = setup()
        cleanup_started,release = asyncio.Event(),asyncio.Event()
        bridge = VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
        from dagmar_server.models import VoiceSmartOperation
        with ports.session_factory() as db:
            db.add(VoiceSmartOperation(request_id='original-request',owner_session_id='owner',call_id='original-call',
                                      arguments_digest='a'*64,status='uncertain'))
            db.commit()
        bridge.unresolved_requests.add('original-request')
        bridge.contract_acknowledgements['smartplan']={'projection_digest':'other-acked-projection'}
        client = SimpleNamespace(room_ref_supported=True,metadata_available=True,model_projection={'tools':[]})
        def invalidate():
            client.metadata_available = False
            client.model_projection = None
        client.invalidate_metadata = invalidate
        async def refresh():
            invalidate()
            raise SmartError('mcp_incompatible')
        client.refresh_metadata = refresh
        @asynccontextmanager
        async def connection(token):
            try:
                yield client
            finally:
                cleanup_started.set()
                await release.wait()
        async def catalog(payload):
            return SimpleNamespace(isError=False,content=[SimpleNamespace(type='text',text=json.dumps({'catalog_revision':'r'}))])
        async def context(value):
            bridge.catalog_ready = True
        async def configure(enabled):
            if enabled:
                bridge.contract_acknowledgements['ha']={'projection_digest':'previous-canonical'}
        bridge.mcp_call,bridge.replace_context,bridge.configure = catalog,context,configure
        ports = replace(ports,ha_connector=connection,
                        settings=ports.settings.model_copy(update={'voice_metadata_refresh_seconds':0}))
        with bind(ports):
            task = asyncio.create_task(bridge.initialize_technologies())
            await asyncio.wait_for(cleanup_started.wait(),3)
            assert not bridge.catalog_ready and bridge.technologies=='unavailable'
            assert 'ha' not in bridge.contract_acknowledgements
            assert bridge.contract_acknowledgements['smartplan']['projection_digest']=='other-acked-projection'
            assert bridge.unresolved_requests=={'original-request'}
            with ports.session_factory() as db:
                original=db.get(VoiceSmartOperation,'original-request')
                assert original.status=='uncertain' and original.call_id=='original-call'
            with pytest.raises(SmartError,match='mcp_incompatible'):
                await smart.call_smart(client,{'operation':'catalog'})
            bridge.closed = True
            release.set()
            await asyncio.wait_for(task,1)
            await host.close()
    asyncio.run(run())

@pytest.mark.parametrize('capability',['ha','smartplan'])
@pytest.mark.parametrize('failure',[401,403,'integrity'])
def test_existing_session_auth_or_integrity_failure_never_falls_back(capability,failure,monkeypatch):
    async def run():
        _,ports,_,host,_ = setup()
        if capability=='ha':
            fixture = HA()
            original_client = httpx.AsyncClient
            monkeypatch.setattr(smart.httpx,'AsyncClient',lambda **kwargs: original_client(
                **kwargs,transport=httpx.MockTransport(fixture)))
            ports = replace(ports,settings=ports.settings.model_copy(update={
                'ha_mcp_url':'https://devices.portable.test/mcp',
                'ha_trusted_origins':('https://devices.portable.test',)}))
            with bind(ports):
                async with smart.mcp_connection('synthetic-ha-credential') as client:
                    if failure=='integrity':
                        fixture.contract['sha256']='0'*64
                    else:
                        fixture.status=failure
                    with pytest.raises(SmartError,match='mcp_incompatible' if failure=='integrity' else 'mcp_access_denied'):
                        await client.refresh_metadata()
                    assert not client.metadata_available and client.model_projection is None
                    with pytest.raises(SmartError,match='mcp_incompatible'):
                        await smart.call_smart(client,{'operation':'catalog'})
                    assert not fixture.calls
                await host.close()
        else:
            fixture = MissingSP()
            from dagmar_server.smartplan import SmartPlanClient
            ports = replace(ports,smartplan_transport=httpx.MockTransport(fixture))
            with bind(ports):
                await host.client.close()
                client=host.client=SmartPlanClient('admin-profile:1')
                await client.initialize()
                if failure=='integrity':
                    fixture.contract['sha256']='0'*64
                else:
                    fixture.export_status=failure
                with pytest.raises(SmartError,match='smartplan_incompatible' if failure=='integrity' else 'smartplan_access_denied'):
                    await client.refresh_metadata()
                assert not client.metadata_available and client.projection is None
                with pytest.raises(SmartError,match='smartplan_incompatible'):
                    await client.call('smartplan_context',{})
                assert not any(body.get('method')=='tools/call' for _,body in fixture.calls)
                await host.close()
    asyncio.run(run())


def test_smartplan_refresh_pauses_before_provider_wait_without_losing_durable_delivery(monkeypatch):
    from dagmar_server import smartplan
    from dagmar_server.smartplan_storage import SmartPlanDelivery
    async def run():
        fixture=MissingSP()
        _,ports,bridge,host,_=setup(fixture)
        ports=replace(ports,settings=ports.settings.model_copy(update={'voice_metadata_refresh_seconds':0}))
        client=host.client
        paused=asyncio.Event()
        bridge.catalog_ready=True
        bridge.contract_acknowledgements={'ha':{'projection_digest':'independent-ha'},'smartplan':{'projection_digest':'old-sp'}}
        async def configure(enabled):
            assert enabled  # HA remains available throughout the SmartPlan outage.
            if host.status=='ready':
                fixture.export_status=405
            else:
                paused.set()
                await asyncio.Future()
        bridge.configure=configure
        monkeypatch.setattr(smartplan,'SmartPlanClient',lambda subject:client)
        with bind(ports):
            with ports.session_factory() as db:
                db.add(SmartPlanDelivery(id='original-delivery',subject='admin-profile:1',logical_call_id='logical-call',
                    tool='smartplan_commit',arguments_digest='a'*64,state='uncertain',
                    proposal_id='original-proposal',request_key='original-request-key'))
                db.commit()
            task=asyncio.create_task(host.initialize())
            await asyncio.wait_for(paused.wait(),2)
            assert host.status=='unavailable' and not client.metadata_available and client.projection is None
            assert 'smartplan' not in bridge.contract_acknowledgements
            assert bridge.contract_acknowledgements['ha']['projection_digest']=='independent-ha'
            with ports.session_factory() as db:
                original=db.get(SmartPlanDelivery,'original-delivery')
                assert (original.state,original.proposal_id,original.request_key)==(
                    'uncertain','original-proposal','original-request-key')
            task.cancel()
            await asyncio.gather(task,return_exceptions=True)
    asyncio.run(run())


@pytest.mark.parametrize('operation',['read','control'])
def test_same_generation_batch_cannot_use_reconnected_ha_before_fresh_ack(operation,monkeypatch):
    from dagmar_server.models import VoiceSmartOperation
    from dagmar_server.smartplan import SmartPlanClient
    from sqlalchemy import func,select
    async def run():
        fixture=Candidate()
        fixture.results['smartplan_open']={'error':{'code':'synthetic_read'}}
        slow_started,slow_release=asyncio.Event(),asyncio.Event()
        async def plans(request):
            if request.method=='POST':
                body=json.loads(request.content)
                if body.get('params',{}).get('name')=='smartplan_open':
                    slow_started.set()
                    await slow_release.wait()
            return fixture(request)
        _,ports,_,host,_=setup(fixture)
        devices=HA(legacy=True)
        original_client=httpx.AsyncClient
        def http(**kwargs):
            kwargs.setdefault('transport',httpx.MockTransport(devices))
            return original_client(**kwargs)
        monkeypatch.setattr(smart.httpx,'AsyncClient',http)
        ports=replace(ports,smartplan_transport=httpx.MockTransport(plans),
                      settings=ports.settings.model_copy(update={
            'ha_mcp_url':'https://devices.portable.test/mcp',
            'ha_trusted_origins':('https://devices.portable.test',)}))
        with bind(ports):
            await host.close()
            bridge=VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            bridge.smartplan.client=SmartPlanClient('admin-profile:1')
            await bridge.smartplan.client.initialize()
            bridge.smartplan.status='ready'
            sp=bridge.smartplan.client.projection
            bridge.contract_acknowledgements['smartplan']={**sp,'provider_event_id':'existing-sp-ack'}
            bridge.contract_acknowledgements['ha']={'projection_digest':'old-canonical','provider_event_id':'old-ha-ack'}
            bridge.catalog_ready=True
            sent,ack_started,ack_release=[],asyncio.Event(),asyncio.Event()
            async def item(value):
                sent.append(value)
                return value.get('id','synthetic-output')
            async def ack(event,match):
                ack_started.set()
                await ack_release.wait()
                return {'type':'session.updated','event_id':'fresh-legacy-ack','session':event['session']}
            async def noop():
                pass
            bridge.item,bridge.send= item,ack
            bridge.prune,bridge.queue_continuations=noop,noop
            args={'operation':operation,'rows':[1],'catalog_revision':'synthetic-revision'}
            if operation=='control':
                args['action']='zapnout'
            batch=asyncio.create_task(bridge.work_batch([
                {'name':'smartplan_open','call_id':'slow-plan','arguments':json.dumps(
                    {'target':{'entity':'scenario','scenario_id':'synthetic-scenario'}})},
                {'name':'smart_technologie','call_id':'queued-old-ha','arguments':json.dumps(args)}]))
            await asyncio.wait_for(slow_started.wait(),2)
            initializer=asyncio.create_task(bridge.initialize_technologies())
            await asyncio.wait_for(ack_started.wait(),2)
            assert bridge.mcp.metadata_available
            assert bridge.mcp.model_projection['compatibility_profile']=='ha-smart-known-2025'
            assert not bridge.catalog_ready and 'ha' not in bridge.contract_acknowledgements
            with pytest.raises(SmartError,match='mcp_configuration_unacknowledged'):
                await bridge.mcp.call_tool('smart_technologie',{'operation':'catalog'})
            slow_release.set()
            await asyncio.wait_for(batch,2)
            # Bootstrap catalog is the only HA wire call: no stale read/control.
            assert [call['operation'] for call in devices.calls]==['catalog']
            outputs={value.get('call_id'):json.loads(value['output']) for value in sent if 'output' in value}
            assert outputs['slow-plan']['error']['code']=='synthetic_read'
            assert outputs['queued-old-ha']['error']=='technologies_unavailable'
            with ports.session_factory() as db:
                assert db.scalar(select(func.count()).select_from(VoiceSmartOperation))==0
            assert bridge.contract_acknowledgements['smartplan']['provider_event_id']=='existing-sp-ack'
            ack_release.set()
            async with asyncio.timeout(2):
                while bridge.technologies!='ready':
                    await asyncio.sleep(0)
            bridge.require_contract_ack('ha')
            assert bridge.contract_acknowledgements['ha']['provider_event_id']=='fresh-legacy-ack'
            await bridge.result({'name':'smart_technologie','call_id':'after-fresh-ack','arguments':'{"operation":"catalog"}'})
            assert [call['operation'] for call in devices.calls]==['catalog','catalog']
            bridge.closed=True
            initializer.cancel()
            await asyncio.gather(initializer,return_exceptions=True)
            await bridge.smartplan.close()
    asyncio.run(run())


def test_smartplan_host_waits_for_fresh_model_ack_while_ha_remains_usable():
    from dagmar_server.smartplan import SmartPlanClient
    async def run():
        fixture=Candidate()
        fixture.results['smartplan_context']={'error':{'code':'synthetic_context'}}
        _,ports,_,host,_=setup(fixture)
        with bind(ports):
            await host.close()
            bridge=VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            bridge.smartplan.client=SmartPlanClient('admin-profile:1')
            await bridge.smartplan.client.initialize()
            bridge.smartplan.status='ready'
            ha=PublicContract(exported('ha_candidate_contract.json'),profiles={'ha-smart/2.1':'smart/2'}).project()
            bridge.mcp=SimpleNamespace(metadata_available=True,model_projection=ha)
            bridge.catalog_ready=True
            bridge.contract_acknowledgements['ha']={**ha,'provider_event_id':'independent-ha-ack'}
            started,release=asyncio.Event(),asyncio.Event()
            outputs=[]
            async def item(value):
                outputs.append(value)
            async def ack(event,match):
                started.set()
                await release.wait()
                return {'type':'session.updated','event_id':'fresh-sp-ack','session':event['session']}
            bridge.item,bridge.send=item,ack
            configuring=asyncio.create_task(bridge.configure(True))
            await started.wait()
            await bridge.smartplan.result({'name':'smartplan_context','call_id':'before-ack','arguments':'{}'})
            assert json.loads(outputs[-1]['output'])['error']['code']=='smartplan_configuration_unacknowledged'
            assert not any(body.get('method')=='tools/call' for _,body in fixture.calls)
            bridge.require_contract_ack('ha')
            release.set()
            await configuring
            await bridge.smartplan.result({'name':'smartplan_context','call_id':'after-ack','arguments':'{}'})
            assert json.loads(outputs[-1]['output'])['error']['code']=='synthetic_context'
            assert len([body for _,body in fixture.calls if body.get('method')=='tools/call'])==1
            await bridge.smartplan.close()
    asyncio.run(run())


@pytest.mark.parametrize('capability',['ha','smartplan'])
def test_cleared_capability_ack_requires_fresh_full_provider_update_even_for_same_view(capability):
    async def run():
        _,ports,_,host,_=setup()
        with bind(ports):
            bridge=VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            ha=PublicContract(exported('ha_candidate_contract.json'),profiles={'ha-smart/2.1':'smart/2'}).project()
            sp=PublicContract(exported('smartplan_candidate_contract.json'),
                             profiles={'smartplan-navigation-1-2025-v2':'navigation/1'}).project(recommended=RECOMMENDED)
            bridge.mcp=SimpleNamespace(metadata_available=True,model_projection=ha)
            bridge.smartplan.client=SimpleNamespace(metadata_available=True,projection=sp)
            bridge.smartplan.status='ready'
            sent=[]
            async def ack(event,match):
                sent.append(event)
                return {'type':'session.updated','event_id':'ack-'+str(len(sent)),'session':event['session']}
            bridge.send=ack
            await bridge.configure(True)
            await bridge.configure(True)
            assert len(sent)==1
            bridge.contract_acknowledgements.pop(capability)
            await bridge.configure(True)
            assert len(sent)==2 and 'tools' in sent[1]['session']
            assert bridge.contract_acknowledgements[capability]['provider_event_id']=='ack-2'
            assert not bridge.contract_acknowledgements[capability]['provider_ack_reused']
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('capability',['ha','smartplan'])
def test_old_inflight_ack_cannot_ack_reconnected_client_even_with_identical_projection(capability):
    async def run():
        _,ports,_,host,_=setup()
        with bind(ports):
            bridge=VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            ha=PublicContract(exported('ha_candidate_contract.json'),profiles={'ha-smart/2.1':'smart/2'}).project()
            sp=PublicContract(exported('smartplan_candidate_contract.json'),
                             profiles={'smartplan-navigation-1-2025-v2':'navigation/1'}).project(recommended=RECOMMENDED)
            bridge.mcp=SimpleNamespace(metadata_available=True,model_projection=ha)
            bridge.smartplan.client=SimpleNamespace(metadata_available=True,projection=sp)
            bridge.smartplan.status='ready'
            sent=[]
            async def ack(event,match):
                sent.append(event)
                if len(sent)==1:
                    bridge.contract_acknowledgements.pop(capability,None)
                    if capability=='ha':
                        bridge.mcp=SimpleNamespace(metadata_available=True,model_projection=copy.deepcopy(ha))
                    else:
                        bridge.smartplan.client=SimpleNamespace(metadata_available=True,projection=copy.deepcopy(sp))
                return {'type':'session.updated','event_id':'ack-'+str(len(sent)),'session':event['session']}
            bridge.send=ack
            await bridge.configure(True)
            assert capability not in bridge.contract_acknowledgements
            with pytest.raises(SmartError,match='configuration_unacknowledged'):
                bridge.require_contract_ack(capability)
            await bridge.configure(True)
            assert len(sent)==2 and 'tools' in sent[1]['session']
            assert bridge.contract_acknowledgements[capability]['provider_event_id']=='ack-2'
            assert '_client' not in bridge.contract_acknowledgements[capability]
            bridge.require_contract_ack(capability)
            await host.close()
    asyncio.run(run())
