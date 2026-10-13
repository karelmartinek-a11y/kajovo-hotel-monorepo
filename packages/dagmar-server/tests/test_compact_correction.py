"""Real public-handler compact success reaches the model with typed reading identity."""
import asyncio
import json
from pathlib import Path
from dataclasses import replace
import httpx
import pytest
from voice_core_server import VoiceCoreConfig
from dagmar_server import smart
from dagmar_server.orchestration import VoiceBridge
from dagmar_server.ports import bind
from dagmar_server.smart import SmartArguments
from test_smartplan import setup

FIXTURE = json.loads((Path(__file__).with_name('fixtures')/'ha-compact-correction.json').read_text())


def test_compact_read_success_through_real_sdk_host_and_model_output(monkeypatch):
    async def run():
        calls = []
        async def transport(request):
            if request.method=='GET':
                return httpx.Response(200,json=FIXTURE['canonical_contract']) if request.url.params.get('contract')=='1' else httpx.Response(405)
            if request.method=='DELETE':
                return httpx.Response(200)
            body=json.loads(request.content)
            if 'id' not in body:
                return httpx.Response(202)
            if body['method']=='initialize':
                value={'protocolVersion':'2025-03-26','capabilities':{'tools':{}},
                    'serverInfo':{'name':'KajaVoiceHA','version':'2.1.26'},'instructions':FIXTURE['canonical_contract']['instructions']}
            elif body['method']=='tools/list':
                value={'tools':FIXTURE['canonical_contract']['tools']}
            else:
                calls.append(body['params'])
                value=FIXTURE['result']
            return httpx.Response(200,json={'jsonrpc':'2.0','id':body['id'],'result':value})
        original=httpx.AsyncClient
        def http(**kwargs):
            kwargs.setdefault('transport',httpx.MockTransport(transport))
            return original(**kwargs)
        monkeypatch.setattr(smart.httpx,'AsyncClient',http)
        _,ports,_,old,_=setup()
        ports=replace(ports,settings=ports.settings.model_copy(update={
            'ha_mcp_url':'https://devices.portable.test/mcp','ha_trusted_origins':('https://devices.portable.test',)}))
        with bind(ports):
            await old.close()
            bridge=VoiceBridge('owner','provider','key','token',VoiceCoreConfig(),'gpt-realtime-2.1')
            outputs=[]
            async def item(value):
                outputs.append(value)
                return value.get('id','output')
            async def ack(event,match):
                return {'type':'session.updated','event_id':'compact-host-ack','session':event['session']}
            bridge.item,bridge.send=item,ack
            async with smart.mcp_connection('synthetic-ha-token') as client:
                bridge.mcp=client
                bridge.catalog_ready=True
                await bridge.configure(True)
                args={k:v for k,v in FIXTURE['arguments'].items() if k not in {'api_version','session_id'}}
                await bridge.result({'name':'smart_technologie','call_id':'compact-reading','arguments':json.dumps(args)})
                output=json.loads(next(v['output'] for v in outputs if v.get('call_id')=='compact-reading'))
                assert 'error' not in output
                assert output['complete'] is True and output['returned']==1 and output['has_more'] is False
                assert output['targets']==FIXTURE['result']['structuredContent']['targets']
                reading=output['targets'][0]['readings'][0]
                assert reading['identity']=={'catalog_revision':'fixture-revision','row':1,'function':'r01'}
                assert reading['value']=='vypnuto' and reading['source']=='home_assistant_reported'
                assert reading['observed_at']==FIXTURE['result']['structuredContent']['observed_at']
                assert calls[0]['arguments']['readings']==[{'row':1,'function':'r01'}] and len(calls)==1
                assert bridge.contract_acknowledgements['ha']['metadata_digest']==FIXTURE['canonical_contract']['sha256']
    asyncio.run(run())


@pytest.mark.parametrize('readings', [['r01'], [], [{'row':0,'function':'r01'}], [{'row':1,'function':'c01'}],
    [{'row':1,'function':'r01','extra':True}], [{'row':1,'function':'r01'}]*2])
def test_reading_selector_rejects_unsupported_or_duplicate_shape(readings):
    with pytest.raises(ValueError):
        SmartArguments(operation='read',rows=[1],catalog_revision='rev',readings=readings)
