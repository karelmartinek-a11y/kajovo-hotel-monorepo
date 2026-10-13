"""Public schema compatibility and calendar semantics; no upstream effects."""
import asyncio
import copy

import pytest
from jsonschema import Draft202012Validator
from mcp.types import Tool

from dagmar_server.public_contract import PUBLIC_FORMATS, PublicContract, compatible_schema, digest, legacy_contract
from dagmar_server.smart import SmartError
from dagmar_server.ports import bind
from test_public_bridge import Candidate, exported
from test_smartplan import setup


def scenario(anchor='2026-02-28T12:00:00', basis='calendar'):
    return {'name':'Synthetic calendar', 'triggers':[{'kind':'time','schedule':{
        'kind':'interval','every':1,'unit':'days','basis':basis,'anchor':anchor,
        'policy':{'missing_hour':'skip','repeated_hour':'first','missing_monthday':'skip'}}}],
        'condition':{'kind':'constant','value':True}, 'actions':[{'kind':'delay','seconds':1}],
        'retrigger':'ignore','misfire':'skip'}


def test_root_properties_cannot_shadow_union_operation():
    tools = exported('smartplan_candidate_contract.json')['tools']
    expected = next(tool['inputSchema'] for tool in tools if tool['name']=='smartplan_prepare_change')
    assert 'properties' not in expected
    actual = {**copy.deepcopy(expected),'properties':{'operation':{'const':'never'}}}
    assert not compatible_schema(expected, actual)


@pytest.mark.parametrize('via_reference',[False,True])
def test_added_properties_cannot_shadow_fields_in_variants_or_refs(via_reference):
    operation = {'type':'object','properties':{'operation':{'const':'read'}},'required':['operation']}
    expected = {'type':'object','properties':{'common':{'type':'string'}},
                'oneOf':[{'$ref':'#/$defs/Operation'} if via_reference else operation]}
    if via_reference:
        expected['$defs'] = {'Operation':operation}
    valid = copy.deepcopy(expected)
    valid['properties']['optional'] = {'type':'number'}
    assert compatible_schema(expected, valid)
    invalid = copy.deepcopy(expected)
    invalid['properties']['operation'] = {'const':'never'}
    assert not compatible_schema(expected, invalid)


@pytest.mark.parametrize('keyword,value,changed',[
    ('const',{'description':'original'},{'description':'different'}),
    ('enum',[{'title':'original','default':'original'}],[{'title':'different','default':'different'}]),
    ('const',{'count':1},{'count':True}),
])
def test_const_enum_json_data_never_ignores_schema_annotation_names(keyword,value,changed):
    expected = {'type':'object',keyword:value}
    actual = {**expected,keyword:changed}
    assert not compatible_schema(expected, actual)
    assert compatible_schema(expected,{**expected,'description':'Annotation only'})


@pytest.mark.parametrize('fmt,value,valid',[
    ('date','2024-02-29',True),('date','2026-02-29',False),('date','2026-02-30',False),
    ('date-time','2024-02-29T12:00:00Z',True),('date-time','2026-02-28T12:00:00+02:00',True),
    ('date-time','2026-02-28T12:00:00',False),('date-time','12:00:00',False),
    ('date-time','2026-02-30T12:00:00Z',False),('date-time','2026-02-28T12:00:00+01:99',False),
    ('local-date-time','2024-02-29T12:00:00.125',True),('local-date-time','2026-02-30T12:00:00',False),
    ('local-date-time','2026-02-28T12:00:00Z',False),('local-date-time','2026-02-28T12:00:00+01:00',False),
    ('local-date-time','2026-02-28',False),('local-date-time','2026-02-28T24:00:00',False),
    ('local-time','12:30',True),('local-time','12:30:10.125',True),
    ('local-time','24:00:00',False),('local-time','12:30:00Z',False),('local-time','12:30:00+01:00',False),
    ('time','12:30:00Z',True),('time','12:30:00.125+01:00',True),('time','12:30:00',False),
])
def test_all_published_formats_assert_real_calendar_and_offset_semantics(fmt,value,valid):
    errors = list(Draft202012Validator({'type':'string','format':fmt},format_checker=PUBLIC_FORMATS).iter_errors(value))
    assert bool(errors) is not valid


@pytest.mark.parametrize('anchor,basis,valid',[
    ('2026-02-28T12:00:00','calendar',True),('2026-02-30T12:00:00','calendar',False),
    ('2026-02-28T12:00:00Z','calendar',False),('2026-02-28T12:00:00+01:00','calendar',False),
    ('2026-02-28T12:00:00Z','elapsed',True),('2026-02-28T12:00:00+01:00','elapsed',True),
    ('2026-02-28T12:00:00','elapsed',False),
])
def test_candidate_preview_input_calendar_and_elapsed_basis(anchor,basis,valid):
    value = exported('smartplan_candidate_contract.json')
    contract = PublicContract(value,profiles={'smartplan-navigation-1-2025-v2':'navigation/1'})
    if valid:
        contract.validate_input('smartplan_preview',{'scenario':scenario(anchor,basis)})
    else:
        with pytest.raises(ValueError,match='invalid_contract_arguments'):
            contract.validate_input('smartplan_preview',{'scenario':scenario(anchor,basis)})


def test_known_old_temporal_translation_preserves_raw_metadata_and_strict_other_fields():
    raw = exported('smartplan_live_contract.json')
    original = copy.deepcopy(raw)
    contract = legacy_contract(raw['instructions'],[Tool.model_validate(tool) for tool in raw['tools']],[raw],
                               profile='smartplan-known-2025',version='navigation/1')
    assert raw == original
    contract.verify_wire([Tool.model_validate(tool) for tool in raw['tools']])
    assert contract.schema_policy == 'smartplan-known-calendar/1'
    assert contract.metadata_digest == digest({k:v for k,v in contract.value.items() if k!='sha256'})
    preview = next(tool for tool in contract.project()['tools'] if tool['name']=='smartplan_preview')
    assert preview['parameters']['$defs']['Calendar']['properties']['times']['items']['format']=='local-time'
    output = {'status':'opened','coverage':{'checked_at':'2026-02-28T12:00:00Z'},'scenario':scenario()}
    contract.validate_input('smartplan_preview',{'scenario':scenario()})
    contract.validate_output('smartplan_open',output)
    for anchor,basis in [('2026-02-30T12:00:00','calendar'),('2026-02-28T12:00:00Z','calendar'),
                         ('2026-02-28T12:00:00','elapsed')]:
        invalid = {**output,'scenario':scenario(anchor,basis)}
        with pytest.raises(ValueError,match='invalid_contract_output'):
            contract.validate_output('smartplan_open',invalid)
    contract.validate_output('smartplan_open',{**output,'scenario':scenario('2026-02-28T12:00:00Z','elapsed')})
    invalid = copy.deepcopy(output)
    invalid['scenario']['triggers'].append({'kind':'time','schedule':{'kind':'once','at':'2026-02-28T12:00:00'}})
    with pytest.raises(ValueError,match='invalid_contract_output'):
        contract.validate_output('smartplan_open',invalid)
    assert raw == original


@pytest.mark.parametrize('change',['optional','missing_required','missing_field','changed_type'])
def test_known_output_schema_gate_keeps_required_fields_and_types(change):
    output = {'type':'object','properties':{'outcome':{'type':'string'},'effect_state':{'enum':['none','prepared']}},
              'required':['outcome','effect_state'],'additionalProperties':False}
    actual = copy.deepcopy(output)
    if change=='optional':
        actual['properties']['optional'] = {'type':'string'}
    elif change=='missing_required':
        actual['required'].remove('effect_state')
    elif change=='missing_field':
        actual['properties'].pop('outcome')
    else:
        actual['properties']['outcome']['type'] = 'number'
    value = {'contract_version':'fixture/1','guidance_version':'fixture/1','compatibility_profile':'fixture/1',
             'digest_algorithm':'sha256-canonical-json-v1','instructions':'Synthetic only.',
             'tools':[{'name':'fixture','inputSchema':{'type':'object'},'outputSchema':actual}]}
    value['sha256'] = digest(value)
    if change=='optional':
        PublicContract(value,profiles={'fixture/1':'fixture/1'},expected_outputs={'fixture':output})
    else:
        with pytest.raises(ValueError,match='breaking_contract_output_schema'):
            PublicContract(value,profiles={'fixture/1':'fixture/1'},expected_outputs={'fixture':output})


@pytest.mark.parametrize('phase',['connect','refresh'])
def test_real_candidate_client_rejects_breaking_output_before_any_tool_call(phase):
    async def run():
        fixture = Candidate()
        _,ports,_,host,_ = setup(fixture)
        with bind(ports):
            if phase=='refresh':
                await host.client.initialize()
            tool = next(t for t in fixture.contract['tools'] if t['name']=='smartplan_open')
            tool['outputSchema']['anyOf'][0]['required'].remove('status')
            fixture.contract['tools_sha256'] = digest(fixture.contract['tools'])
            fixture.contract['sha256'] = digest({k:v for k,v in fixture.contract.items() if k!='sha256'})
            with pytest.raises(SmartError,match='incompatible'):
                await (host.client.initialize() if phase=='connect' else host.client.refresh_metadata())
            assert not any(body.get('method')=='tools/call' for _,body in fixture.calls)
            await host.close()
    asyncio.run(run())


@pytest.mark.parametrize('capability',['ha','smartplan'])
def test_metadata_only_and_policy_refresh_reuses_exact_ack_without_per_command_update(capability):
    from types import SimpleNamespace
    from dagmar_server.orchestration import VoiceBridge
    from dagmar_server.smartplan import RECOMMENDED
    from voice_core_server import VoiceCoreConfig
    async def run():
        _,ports,_,_,_ = setup()
        with bind(ports):
            bridge = VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            values = {'ha':exported('ha_candidate_contract.json'),'smartplan':exported('smartplan_candidate_contract.json')}
            def project(name,value,policy='canonical-strict/1'):
                profile = {'ha':'ha-smart/2.1','smartplan':'smartplan-navigation-1-2025-v2'}[name]
                version = {'ha':'smart/2','smartplan':'navigation/1'}[name]
                return PublicContract(value,profiles={profile:version},schema_policy=policy).project(
                    recommended=RECOMMENDED if name=='smartplan' else None)
            bridge.mcp = SimpleNamespace(model_projection=project('ha',values['ha']))
            bridge.smartplan.client = SimpleNamespace(projection=project('smartplan',values['smartplan']))
            bridge.smartplan.status = 'ready'
            sent = []
            changed = copy.deepcopy(values[capability])
            changed['guidance_version'] += '.metadata-only'
            changed['sha256'] = digest({k:v for k,v in changed.items() if k!='sha256'})
            projection = project(capability,changed)
            async def accepted(event,match):
                sent.append(event)
                # Verified metadata can arrive while the original model ACK is
                # in flight; its provenance is recorded only on the next view.
                if capability=='ha':
                    bridge.mcp.model_projection = projection
                else:
                    bridge.smartplan.client.projection = projection
                return {'type':'session.updated','event_id':'original-provider-ack','session':event['session']}
            bridge.send = accepted
            await bridge.configure(True)
            assert bridge.contract_acknowledgements[capability]['metadata_digest']==values[capability]['sha256']
            await bridge.configure(True)
            record = bridge.contract_acknowledgements[capability]
            assert record['metadata_digest']==projection['metadata_digest']
            assert record['guidance_version']==changed['guidance_version']
            assert record['provider_event_id']=='original-provider-ack' and record['provider_ack_reused'] is True
            assert len(sent)==1
            revised = project(capability,changed,'known-2025-object-root/1')
            assert revised['tools']==projection['tools'] and revised['instructions']==projection['instructions']
            assert revised['projection_digest']!=projection['projection_digest']
            if capability=='ha':
                bridge.mcp.model_projection = revised
            else:
                bridge.smartplan.client.projection = revised
            await bridge.configure(True)
            record = bridge.contract_acknowledgements[capability]
            assert record['schema_policy']=='known-2025-object-root/1'
            assert record['projection_digest']==revised['projection_digest']
            await bridge.configure(True)
            assert bridge.contract_acknowledgements[capability] is record
            assert len(sent)==1
    asyncio.run(run())
