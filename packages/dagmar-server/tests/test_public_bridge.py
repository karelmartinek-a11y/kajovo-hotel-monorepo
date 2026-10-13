"""Old/candidate public fixtures, provider acknowledgement and scoped foreground races."""
import asyncio
import copy
import json
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from jsonschema import Draft202012Validator
from mcp.types import Tool

from dagmar_server.public_contract import PublicContract, compatible_schema, digest
from dagmar_server.settings import DagmarSettings
from dagmar_server.smart import SmartError
from dagmar_server.smartplan import RECOMMENDED
from dagmar_server.ports import bind
from test_smartplan import Fixture, setup, utc_now, timedelta

BASE = Path(__file__).parents[1] / 'src/dagmar_server'


def exported(name):
    return json.loads((BASE / name).read_text())


@pytest.mark.parametrize('name,profile,version', [
    ('ha_candidate_contract.json','ha-smart/2.1','smart/2'),
    ('smartplan_candidate_contract.json','smartplan-navigation-1-2025-v2','navigation/1')])
def test_canonical_export_projection_profiles(name, profile, version):
    value = exported(name)
    contract = PublicContract(value, profiles={profile:version})
    contract.verify_wire([Tool.model_validate(tool) for tool in value['tools']])
    projection = contract.project(recommended=RECOMMENDED if name.startswith('smartplan') else None)
    assert projection['metadata_digest'] == value['sha256']
    assert projection['projection_digest'] != projection['metadata_digest']
    assert projection == contract.project(recommended=RECOMMENDED if name.startswith('smartplan') else None)
    if name.startswith('smartplan'):
        assert RECOMMENDED == value['recommended_tools']
        assert 'smartplan_preview' in [tool['name'] for tool in projection['tools']]
    for tool in projection['tools']:
        assert tool['parameters']['type'] == 'object'
        Draft202012Validator.check_schema(tool['parameters'])
    corrupt = copy.deepcopy(value)
    corrupt['metadata_digest'] = '0'*64
    with pytest.raises(ValueError, match='integrity'):
        PublicContract(corrupt, profiles={profile:version})
    corrupt = copy.deepcopy(value)
    corrupt['compatibility_profile'] = 'breaking/99'
    corrupt['sha256'] = digest({k:v for k,v in corrupt.items() if k != 'sha256'})
    with pytest.raises(ValueError, match='unsupported_contract_profile'):
        PublicContract(corrupt, profiles={profile:version})


def test_host_identity_projection_keeps_operation_constraints():
    value = exported('ha_candidate_contract.json')
    model = PublicContract(value, profiles={'ha-smart/2.1':'smart/2'}).project()['tools'][0]['parameters']
    validate = Draft202012Validator(model)
    assert 'prepnout' not in model['properties']['action']['enum']
    assert not list(validate.iter_errors({'operation':'read','rows':[1], 'catalog_revision':'r'}))
    assert list(validate.iter_errors({'operation':'read','rows':[1]}))
    for payload in [
        {'operation':'control','selection_id':'s','action':'zapnout','session_id':'foreign'},
        {'operation':'control','selection_id':'s','action':'zapnout','request_id':'model'},
        {'operation':'control','selection_id':'s','rows':[1],'action':'zapnout'},
        {'operation':'read','rows':[1],'catalog_revision':'r','action':'zapnout'},
        {'operation':'search','response_mode':'complete','offset':0}]:
        assert list(validate.iter_errors(payload))
    assert not list(validate.iter_errors({'operation':'operation_status','request_id':'original'}))


def test_additive_optional_fields_keep_known_profile_required_drift_does_not():
    expected = {'type':'object','properties':{'x':{'type':'string'}},'required':['x'],'additionalProperties':False}
    additive = copy.deepcopy(expected)
    additive['properties']['optional'] = {'type':'number'}
    additive['description'] = 'Annotation only'
    additive['properties']['x']['default'] = 'hint'
    assert compatible_schema(expected, additive)
    additive['required'].append('optional')
    assert not compatible_schema(expected, additive)


@pytest.mark.parametrize('restriction', [
    {'allOf':[{'not':{'required':['operation']}}]},
    {'not':{'required':['operation']}},
    {'maxProperties':0},
    {'unevaluatedProperties':False},
    {'propertyNames':{'not':{'const':'operation'}}},
    {'dependentRequired':{'operation':['unavailable']}},
    {'if':{'required':['operation']},'then':False},
])
def test_new_validation_keywords_cannot_masquerade_as_additive(restriction):
    expected = {'type':'object','properties':{'operation':{'const':'read'}},'required':['operation']}
    actual = {**copy.deepcopy(expected), **restriction}
    assert not list(Draft202012Validator(expected).iter_errors({'operation':'read'}))
    assert not compatible_schema(expected, actual)
    nested = copy.deepcopy(expected)
    nested['properties']['operation']['maxLength'] = 0
    assert not compatible_schema(expected, nested)


class Candidate(Fixture):
    def __init__(self):
        super().__init__()
        self.contract = exported('smartplan_candidate_contract.json')
        self.catalog = self.contract['tools']

    def __call__(self, request):
        if request.method == 'GET' and request.url.path == '/contract':
            return httpx.Response(200, json=self.contract)
        if request.method == 'POST' and request.url.path == '/mcp':
            body = json.loads(request.content)
            if body.get('method') == 'initialize':
                self.calls.append(('/mcp',body))
                return httpx.Response(200, json={'jsonrpc':'2.0','id':body['id'],'result':{
                    'serverInfo':{'name':'SmartPlan','version':self.contract['implementation_version']},
                    'instructions':self.contract['instructions'],'protocolVersion':'2025-03-26','capabilities':{'tools':{}}}})
            name = body.get('params',{}).get('name')
            if name == 'smartplan_preview':
                self.calls.append(('/mcp',body))
                value = {'valid':True, 'scenario':body['params']['arguments']['scenario'],
                         'next_occurrences':[], 'targets':[], 'upstream_validation':{},
                         'execution_readiness':{}, 'executed':False}
                return httpx.Response(200,json={'jsonrpc':'2.0','id':body['id'],'result':{'structuredContent':value,
                    'content':[{'type':'text','text':json.dumps(value)}]}})
            if name == 'smartplan_prepare_change':
                self.calls.append(('/mcp',body))
                args = body['params']['arguments']
                value = {'status':'prepared','proposal_id':'candidate-proposal','operation':args['operation'],
                    'scenario_id':'scenario','expected_revision':7,'fingerprint':'a'*64,'diff':{},
                    'expires_at':(utc_now()+timedelta(minutes=20)).isoformat(),'status_after':'paused','replay':False,
                    'confirmation':'not_required','commit_authorization':'authenticated_scoped_user_request',
                    'next_occurrences':[],'warnings':[],'execution_readiness':{},'upstream_validation':{}}
                return httpx.Response(200,json={'jsonrpc':'2.0','id':body['id'],'result':{'structuredContent':value,
                    'content':[{'type':'text','text':json.dumps(value)}]}})
            if name == 'smartplan_commit':
                self.calls.append(('/mcp',body))
                self.submissions += int(not self.commits)
                value = self.commits.setdefault(body['params']['arguments']['proposal_id'],{
                    'scenario_id':'scenario','revision':8,'status':'paused','operation_id':'original-operation',
                    'replay':False,'run_id':None,'eligibility_at_apply':False,'physical_result':'not_asserted'})
                return httpx.Response(200,json={'jsonrpc':'2.0','id':body['id'],'result':{'structuredContent':value,
                    'content':[{'type':'text','text':json.dumps(value)}]}})
        return super().__call__(request)


def test_candidate_uses_public_projection_and_concrete_request_no_extra_confirmation():
    async def run():
        _, ports, bridge, host, fixture = setup(Candidate())
        with bind(ports):
            bridge.human_turns.event({'type':'input_audio_buffer.speech_started','item_id':'request'})
            bridge.human_turns.event({'type':'input_audio_buffer.committed','item_id':'request'})
            args = {'operation':'pause','scenario_id':'scenario','expected_revision':7}
            await host.result({'name':'smartplan_prepare_change','arguments':json.dumps(args),'call_id':'prepare'})
            output = json.loads(bridge.sent[-1]['output'])
            assert output['status'] == 'prepared'
            assert [tool['name'] for tool in host.tools()] == RECOMMENDED
            assert host.client.projection['metadata_digest'] == fixture.contract['sha256']
            await host.execute('smartplan_commit', {'proposal_id':output['proposal_id']})
            await host.execute('smartplan_commit', {'proposal_id':output['proposal_id']})
            assert fixture.submissions == 1
            assert not any(path == '/host/confirm' for path,_ in fixture.calls)
            prepared = next(body for _,body in fixture.calls if body.get('params',{}).get('name') == 'smartplan_prepare_change')
            assert prepared['params']['arguments']['request_key'].startswith('voice-')
            assert not host.blocking
            await host.close()
    asyncio.run(run())


def test_explicit_preview_is_model_available_readonly_without_native_write_intent():
    from sqlalchemy import func, select
    from dagmar_server.smartplan_storage import SmartPlanDelivery, SmartPlanReceipt
    async def run():
        _, ports, bridge, host, fixture = setup(Candidate())
        scenario = {'name':'Synthetic preview', 'triggers':[{'kind':'time','schedule':{
            'kind':'once','at':'2030-01-01T12:00:00+01:00'}}],
            'condition':{'kind':'constant','value':True}, 'actions':[{'kind':'delay','seconds':1}],
            'retrigger':'ignore','misfire':'skip'}
        with bind(ports):
            assert not bridge.human_turns.turns
            await host.result({'name':'smartplan_preview','arguments':json.dumps({'scenario':scenario}),'call_id':'readonly-preview'})
            output = json.loads(bridge.sent[-1]['output'])
            assert output['valid'] is True and output['executed'] is False
            assert 'smartplan_preview' in [tool['name'] for tool in host.tools()]
            calls = [body['params']['name'] for _,body in fixture.calls if body.get('method')=='tools/call']
            assert calls == ['smartplan_preview']
            assert not fixture.submissions and not fixture.attestations and not host.blocking
            with ports.session_factory() as db:
                assert db.scalar(select(func.count()).select_from(SmartPlanDelivery)) == 0
                assert db.scalar(select(func.count()).select_from(SmartPlanReceipt)) == 0
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('url,origins',[
    ('http://public.example.test/mcp',('http://public.example.test',)),
    ('https://user:secret@public.example.test/mcp',('https://public.example.test',)),
    ('https://127.0.0.1/mcp',('https://127.0.0.1',)),
    ('https://public.example.test/mcp',()),
    ('https://public.example.test/mcp?token=x',('https://public.example.test',))])
def test_endpoint_config_rejects_credential_local_untrusted_origins(url, origins):
    with pytest.raises(ValueError):
        DagmarSettings(ha_mcp_url=url, ha_trusted_origins=origins)


def test_endpoint_relocation_uses_same_public_client():
    async def run():
        fixture = Candidate()
        _, ports, _, host, _ = setup(fixture)
        seen = []
        def alternative(request):
            seen.append(str(request.url))
            request.url = request.url.copy_with(host='smartplan.hcasc.cz')
            return fixture(request)
        config = ports.settings.model_copy(update={'smartplan_base_url':'https://plan.example.test',
                                                   'smartplan_trusted_origins':('https://plan.example.test',)})
        from dataclasses import replace
        ports = replace(ports, settings=config, smartplan_transport=httpx.MockTransport(alternative))
        with bind(ports):
            from dagmar_server.smartplan import SmartPlanClient
            client = SmartPlanClient('admin-profile:1')
            await client.initialize()
            await client.close()
        assert seen and all(url.startswith('https://plan.example.test/') for url in seen)
    asyncio.run(run())


def test_provider_projection_ack_is_exact_cached_and_independent():
    from dagmar_server.orchestration import VoiceBridge
    from voice_core_server import VoiceCoreConfig
    async def run():
        _, ports, _, _, _ = setup()
        with bind(ports):
            bridge = VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            value = exported('ha_candidate_contract.json')
            projection = PublicContract(value, profiles={'ha-smart/2.1':'smart/2'}).project()
            bridge.mcp = SimpleNamespace(model_projection=projection)
            sent = []
            async def accepted(event, match):
                sent.append(event)
                return {'type':'session.updated','event_id':'provider-ack','session':event['session']}
            bridge.send = accepted
            await bridge.configure(True)
            assert bridge.contract_acknowledgements['ha']['projection_digest'] == projection['projection_digest']
            assert bridge.contract_acknowledgements['ha']['provider_event_id'] == 'provider-ack'
            await bridge.configure(True)
            assert len(sent) == 1
            bridge.catalog_ready = False
            await bridge.configure(False)
            assert 'ha' not in bridge.contract_acknowledgements
            assert any(tool['name'] == 'assistant_memory' for tool in sent[-1]['session']['tools'])
            bridge.configuration_digest = None
            async def wrong(event, match):
                return {'type':'session.updated','session':{**event['session'],'tools':[]}}
            bridge.send = wrong
            with pytest.raises(SmartError, match='provider_tools_mismatch'):
                await bridge.configure(True)
    asyncio.run(run())


def test_obsolete_read_cannot_block_new_foreground_and_task_generations_are_isolated():
    from dagmar_server.orchestration import VoiceBridge
    from voice_core_server import VoiceCoreConfig
    async def run():
        _, ports, _, _, _ = setup()
        with bind(ports):
            bridge = VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            started, cancelled, current = asyncio.Event(), asyncio.Event(), asyncio.Event()
            async def batch(calls):
                bridge.operation_generation = calls[0]['_turn_generation']
                if calls[0]['call_id'] == 'old':
                    started.set()
                    try:
                        await asyncio.sleep(30)
                    except asyncio.CancelledError:
                        cancelled.set()
                        raise
                else:
                    assert bridge.operation_generation == 1
                    bridge.assert_current_operation()
                    current.set()
            bridge.work_batch = batch
            worker = asyncio.create_task(bridge.work())
            await bridge.enqueue([{'name':'smart_technologie','arguments':'{"operation":"read"}','call_id':'old','_turn_generation':0}])
            await started.wait()
            bridge.turns.event({'type':'input_audio_buffer.speech_started'})
            bridge.cancel_obsolete_foreground()
            await bridge.enqueue([{'name':'smart_technologie','arguments':'{"operation":"read"}','call_id':'new','_turn_generation':1}])
            await asyncio.wait_for(current.wait(), .5)
            await asyncio.wait_for(cancelled.wait(), .5)
            bridge.closed = True
            worker.cancel()
            await asyncio.gather(worker,return_exceptions=True)
    asyncio.run(run())


def test_sent_write_recovery_is_detached_while_new_read_runs():
    from dagmar_server.orchestration import VoiceBridge
    from voice_core_server import VoiceCoreConfig
    async def run():
        _, ports, _, _, _ = setup()
        with bind(ports):
            bridge = VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            started, release, current, persisted = (asyncio.Event() for _ in range(4))
            async def batch(calls):
                generation = calls[0]['_turn_generation']
                bridge.operation_generation = generation
                if calls[0]['call_id'] == 'sent':
                    started.set()
                    await release.wait()
                    assert bridge.operation_generation == 0
                    with pytest.raises(SmartError,match='cancelled_not_sent'):
                        bridge.assert_current_operation()
                    persisted.set()
                else:
                    assert bridge.operation_generation == 1
                    current.set()
            bridge.work_batch = batch
            worker = asyncio.create_task(bridge.work())
            await bridge.enqueue([{'name':'smart_technologie','arguments':'{"operation":"control"}','call_id':'sent','_turn_generation':0}])
            await started.wait()
            bridge.turns.event({'type':'input_audio_buffer.speech_started'})
            bridge.cancel_obsolete_foreground()
            await bridge.enqueue([{'name':'smart_technologie','arguments':'{"operation":"read"}','call_id':'new','_turn_generation':1}])
            await asyncio.wait_for(current.wait(), .5)
            assert not persisted.is_set()
            release.set()
            await asyncio.wait_for(persisted.wait(), .5)
            bridge.closed = True
            worker.cancel()
            await asyncio.gather(worker,return_exceptions=True)
    asyncio.run(run())


@pytest.mark.parametrize('name,complete', [('full',True),('partial',False),('replay',True)])
def test_authoritative_control_readback_has_all_commands_and_original_time(name,complete):
    from dagmar_server.smart import complete_readback
    fixture = json.loads((Path(__file__).parent/'fixtures/ha-readback'/('control-readback-'+name+'.json')).read_text())
    assert complete_readback(fixture['result'],fixture['request'],selected_count=fixture['selection_count']) is complete
    if name == 'replay':
        full = json.loads((Path(__file__).parent/'fixtures/ha-readback/control-readback-full.json').read_text())
        assert fixture['result']['verification']['observed_at'] == full['result']['verification']['observed_at']
        assert fixture['result']['observed_at'] == full['result']['observed_at']
    damaged = copy.deepcopy(fixture)
    damaged['result']['verification']['request_id'] = 'different'
    assert not complete_readback(damaged['result'],fixture['request'],selected_count=fixture['selection_count'])


def test_queue_dispatch_rechecks_captured_foreground_generation():
    async def run():
        _, ports, _, host, fixture = setup(Candidate())
        with bind(ports):
            seen = 0
            def guard():
                nonlocal seen
                seen += 1
                if seen > 1:
                    raise SmartError('cancelled_not_sent')
            with pytest.raises(SmartError,match='cancelled_not_sent'):
                await host.client.call('smartplan_context', {}, before_dispatch=guard)
            assert not any(body.get('method') == 'tools/call' for _,body in fixture.calls)
            await host.close()
    asyncio.run(run())


def test_four_sent_commits_leave_reserved_read_capacity_and_original_requests():
    async def run():
        fixture = Candidate()
        _, ports, _, host, _ = setup(fixture)
        started, release = asyncio.Event(), asyncio.Event()
        commits = 0
        async def transport(request):
            nonlocal commits
            if request.method == 'POST':
                body = json.loads(request.content)
                if body.get('params',{}).get('name') == 'smartplan_commit':
                    commits += 1
                    if commits == 4:
                        started.set()
                    await release.wait()
            return fixture(request)
        fixture.results['smartplan_context'] = {'error':{'code':'fixture_read'}}
        from dataclasses import replace
        from dagmar_server.smartplan import SmartPlanClient
        ports = replace(ports, smartplan_transport=httpx.MockTransport(transport))
        with bind(ports):
            client = SmartPlanClient('admin-profile:1')
            await client.initialize()
            pending = [asyncio.create_task(client.call('smartplan_commit', {'proposal_id':'original-'+str(index)})) for index in range(4)]
            await asyncio.wait_for(started.wait(), 1)
            result = await asyncio.wait_for(client.call('smartplan_context',{}), .5)
            assert result['error']['code'] == 'fixture_read'
            with pytest.raises(SmartError,match='busy_not_sent'):
                await client.call('smartplan_commit', {'proposal_id':'not-dispatched'})
            release.set()
            await asyncio.gather(*pending)
            commit_args = [body['params']['arguments']['proposal_id'] for _,body in fixture.calls if body.get('params',{}).get('name') == 'smartplan_commit']
            assert set(commit_args) == {'original-'+str(index) for index in range(4)}
            await client.close()
    asyncio.run(run())


def test_generation_change_after_legacy_host_confirm_sends_no_commit():
    from test_smartplan import approve, SmartPlanReceipt
    from sqlalchemy import select
    async def run():
        engine, ports, bridge, host, fixture = setup()
        current = True
        def guard():
            if not current:
                raise SmartError('cancelled_not_sent')
        bridge.assert_current_operation = guard
        with bind(ports):
            await host.execute('smartplan_prepare',{'operation':'pause','scenario_id':'scenario','expected_revision':7})
            approve(bridge,host)
            original = host.client.post
            async def attested(*args,**kwargs):
                nonlocal current
                value = await original(*args,**kwargs)
                current = False
                return value
            host.client.post = attested
            with pytest.raises(SmartError,match='cancelled_not_sent'):
                await host.commit('server-proposal')
            assert fixture.submissions == 0
            with engine.connect() as db:
                receipt = db.execute(select(SmartPlanReceipt.__table__)).mappings().one()
                assert receipt['proposal_id'] == 'server-proposal'
            await host.close()
    asyncio.run(run())


def test_cancelled_context_replacement_keeps_acknowledged_capability_available():
    from dagmar_server.orchestration import VoiceBridge
    from voice_core_server import VoiceCoreConfig
    async def run():
        _, ports, _, _, _ = setup()
        with bind(ports):
            bridge = VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            bridge.catalog_ready = True
            bridge.catalog_item = 'previous-context'
            bridge.protected_items.add('previous-context')
            entered = asyncio.Event()
            async def slow_delete(iid):
                entered.set()
                await asyncio.sleep(30)
            bridge.delete_item = slow_delete
            async def replace():
                bridge.operation_generation = 0
                await bridge.replace_context({'catalog_revision':'r1','results':[]})
            task = asyncio.create_task(replace())
            await entered.wait()
            bridge.turns.event({'type':'input_audio_buffer.speech_started'})
            task.cancel()
            await asyncio.gather(task,return_exceptions=True)
            assert bridge.catalog_ready
            bridge.operation_generation = 1
            bridge.assert_current_operation()
    asyncio.run(run())


def test_public_metadata_credential_echo_canary_fails_before_model_projection():
    async def run():
        fixture = Candidate()
        token = 'synthetic-voice-token-not-real'
        fixture.contract['instructions'] += token
        fixture.contract['sha256'] = digest({k:v for k,v in fixture.contract.items() if k != 'sha256'})
        _, ports, bridge, host, _ = setup(fixture)
        with bind(ports):
            with pytest.raises(SmartError,match='credential_echo'):
                await host.client.initialize()
            assert not bridge.sent
            await host.close()
    asyncio.run(run())


def test_verified_candidate_additive_fields_reach_host_validation_gate():
    async def run():
        _, ports, _, host, _ = setup(Candidate())
        with bind(ports):
            arguments = {'target':{'entity':'run','run_id':'original-run'},'descriptor_cursor':'opaque-public-cursor'}
            with pytest.raises(SmartError):
                host.validate_input('smartplan_open',arguments)
            await host.client.initialize()
            host.validate_input('smartplan_open',arguments)
            await host.close()
    asyncio.run(run())


def test_raw_legacy_live_wire_rootmodel_matches_before_projection_normalization():
    from dagmar_server.smartplan import LIVE_CONTRACT
    from test_smartplan import Fixture
    class RawOld(Fixture):
        def __init__(self):
            super().__init__()
            self.catalog = exported('smartplan_live_contract.json')['tools']
    async def run():
        fixture = RawOld()
        raw = next(tool for tool in fixture.catalog if tool['name']=='smartplan_prepare_change')
        assert 'type' not in raw['inputSchema']
        assert 'type' not in next(tool for tool in LIVE_CONTRACT['tools'] if tool['name']=='smartplan_prepare_change')['inputSchema']
        _, ports, _, host, _ = setup(fixture)
        with bind(ports):
            await host.client.initialize()
            projection = next(tool for tool in host.client.projection['tools'] if tool['name']=='smartplan_prepare_change')
            assert projection['parameters']['type']=='object'
            assert 'type' not in raw['inputSchema']
            assert host.client.projection['compatibility_profile']=='smartplan-known-2025'
            await host.close()
    asyncio.run(run())
