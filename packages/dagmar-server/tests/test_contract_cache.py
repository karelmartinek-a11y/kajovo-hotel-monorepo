"""Measured schema-cache/offload regression tests and pinned SDK output parity."""
import asyncio
import copy
import json
import threading
import time
from dataclasses import replace

import httpx
import pytest
from jsonschema import Draft202012Validator
from mcp.types import CallToolResult, TextContent
from sqlalchemy import select

from dagmar_server import public_contract
from dagmar_server.mcp_session import ScopedClientSession, ContractOutputMismatch
from dagmar_server.public_contract import PublicContract, digest
from dagmar_server.ports import bind
from dagmar_server.smartplan_storage import SmartPlanDelivery
from test_public_bridge import Candidate
from test_smartplan import setup


def tiny():
    value = {'contract_version':'fixture/1','guidance_version':'fixture/1','compatibility_profile':'fixture/1',
             'digest_algorithm':'sha256-canonical-json-v1','instructions':'Fixture data only.',
             'tools':[{'name':'fixture','description':'Fixture','inputSchema':{'type':'object','additionalProperties':False},
                       'outputSchema':{'type':'object','properties':{'count':{'type':'number'}},'required':['count'],'additionalProperties':False}}]}
    value['sha256'] = digest(value)
    return value


def test_schema_compile_is_singleflight_and_cache_is_bounded(monkeypatch):
    original = Draft202012Validator.check_schema
    count = 0
    lock = threading.Lock()
    def checked(schema,*args,**kwargs):
        nonlocal count
        with lock:
            count += 1
        time.sleep(.01)
        return original(schema,*args,**kwargs)
    monkeypatch.setattr(Draft202012Validator,'check_schema',staticmethod(checked))
    with public_contract._CACHE_LOCK:
        public_contract._COMPILED.clear()
        public_contract._COMPILED_BYTES = 0
    async def run():
        value = tiny()
        contracts = await asyncio.gather(*(asyncio.to_thread(PublicContract,value,profiles={'fixture/1':'fixture/1'}) for _ in range(4)))
        assert count == 2  # Each distinct input/output metaschema checked once.
        assert all(contract.validators['fixture'] is contracts[0].validators['fixture'] for contract in contracts)
        for index in range(5):
            changed = copy.deepcopy(value)
            changed['tools'][0]['description'] += str(index)
            changed['sha256'] = digest({k:v for k,v in changed.items() if k!='sha256'})
            await asyncio.to_thread(PublicContract,changed,profiles={'fixture/1':'fixture/1'})
        assert len(public_contract._COMPILED) <= 4
        assert public_contract._COMPILED_BYTES <= 8*1024*1024
    asyncio.run(run())


def test_real_client_metadata_compile_does_not_block_foreground_loop(monkeypatch):
    original = public_contract._compile_tools
    def slow(encoded):
        time.sleep(.08)
        return original(encoded)
    monkeypatch.setattr(public_contract,'_compile_tools',slow)
    async def run():
        _, ports, _, host, _ = setup(Candidate())
        ticks = 0
        running = True
        async def foreground():
            nonlocal ticks
            while running:
                ticks += 1
                await asyncio.sleep(.002)
        with bind(ports):
            heartbeat = asyncio.create_task(foreground())
            await host.client.initialize()
            running = False
            await heartbeat
            assert ticks >= 10
            await host.close()
    asyncio.run(run())


def test_pinned_sdk_uses_compiled_outputs_and_rejects_bad_types_without_schema_recheck(monkeypatch):
    contract = PublicContract(tiny(),profiles={'fixture/1':'fixture/1'})
    session = object.__new__(ScopedClientSession)
    session.public_contract = contract
    def forbidden(*args,**kwargs):
        raise AssertionError('per-result check_schema is forbidden')
    monkeypatch.setattr(Draft202012Validator,'check_schema',staticmethod(forbidden))
    async def run():
        await session._validate_tool_result('fixture',CallToolResult(content=[],structuredContent={'count':2}))
        for value in ({'count':True},{'count':'2'},{},{'count':2,'extra':'x'}):
            with pytest.raises(ContractOutputMismatch):
                await session._validate_tool_result('fixture',CallToolResult(content=[],structuredContent=value))
        with pytest.raises(ContractOutputMismatch):
            await session._validate_tool_result('fixture',CallToolResult(content=[TextContent(type='text',text='{"count":2}')]))
    asyncio.run(run())


def test_invalid_prepare_output_preserves_original_proposal_and_no_second_effect():
    async def run():
        fixture = Candidate()
        engine, ports, bridge, host, _ = setup(fixture)
        def transport(request):
            response = fixture(request)
            if request.method=='POST' and json.loads(request.content).get('params',{}).get('name')=='smartplan_prepare_change':
                payload = response.json()
                payload['result']['structuredContent']['status_after'] = 7
                return httpx.Response(200,json=payload)
            return response
        ports = replace(ports,smartplan_transport=httpx.MockTransport(transport))
        with bind(ports):
            from dagmar_server.smartplan import SmartPlanClient
            host.client = SmartPlanClient('admin-profile:1')
            bridge.human_turns.event({'type':'input_audio_buffer.speech_started','item_id':'request'})
            bridge.human_turns.event({'type':'input_audio_buffer.committed','item_id':'request'})
            call = {'name':'smartplan_prepare_change','arguments':json.dumps({'operation':'pause','scenario_id':'scenario','expected_revision':7}),'call_id':'prepare'}
            await host.result(call)
            output = json.loads(bridge.sent[-1]['output'])
            assert output['error']['code'] == 'smartplan_invalid_output'
            with engine.connect() as db:
                row = db.execute(select(SmartPlanDelivery.__table__)).mappings().one()
                assert row['state']=='uncertain' and row['proposal_id']=='candidate-proposal'
                assert row['request_key'].startswith('voice-')
            assert fixture.submissions == 0
            await host.close()
    asyncio.run(run())


def test_read_only_output_mismatch_creates_no_uncertain_mutation():
    async def run():
        fixture = Candidate()
        fixture.results['smartplan_context'] = {'not_the_contract':True}
        engine, ports, bridge, host, _ = setup(fixture)
        with bind(ports):
            await host.result({'name':'smartplan_context','arguments':'{}','call_id':'read'})
            assert json.loads(bridge.sent[-1]['output'])['error']['code']=='smartplan_invalid_output'
            with engine.connect() as db:
                assert not db.execute(select(SmartPlanDelivery.__table__)).first()
            assert host.client.initialized
            await host.close()
    asyncio.run(run())


def test_durable_observation_change_requires_committed_native_intent_before_dispatch():
    async def run():
        _, ports, bridge, host, fixture = setup(Candidate())
        with bind(ports):
            await host.result({'name':'smartplan_observe','arguments':json.dumps({'action':'start','binding_id':'binding','reading_refs':['motion']}),'call_id':'untrusted'})
            assert json.loads(bridge.sent[-1]['output'])['error']['code']=='smartplan_new_audio_required'
            assert not fixture.calls
            await host.close()
    asyncio.run(run())
