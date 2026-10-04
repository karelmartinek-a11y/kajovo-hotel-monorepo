"""Opt-in real Realtime/WebRTC test host; public-contract fake HA, own test DB.

Key is supplied on stdin. No hotel sources, credentials or real MCP transport.
Before any paid request reserve USD 9.40 plus USD .10 transcription in the shared
ledger. Bound one call to 90 seconds, six responses, 4096 output tokens each,
20000 initial policy/tool text tokens and small immutable fixture results.
Worst per-response bound: 40480 text input * $4/M + 20480 prior audio * $32/M
+ 9000 live audio tokens * $32/M + 4096 output * $64/M; six < USD 9.40.
Missing provider usage retains its reservation. This is not physical AEC proof.
"""
import asyncio
import base64
from contextlib import asynccontextmanager
from decimal import Decimal
import json
import os
from pathlib import Path
import sys
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from mcp.types import CallToolResult, TextContent
from sqlalchemy import create_engine, update
from sqlalchemy.orm import sessionmaker
from websockets.asyncio.client import connect
from voice_core_server import VoiceCoreConfig
from dagmar_server.application import DagmarApplication, BoundContext
from dagmar_server.models import LogicalCall, VoiceMemorySettings
from dagmar_server.migrations import upgrade, SHARED_ID
from dagmar_server.ports import RuntimePorts
from dagmar_server.settings import DagmarSettings
from dagmar_server.diagnostics import Diagnostics
from dagmar_server.paid_budget import PaidBudget
from dagmar_server.pricing import SNAPSHOT
from dagmar_server.token_budget import measure
from dagmar_server.usage import usage_record

if os.environ.get('VOICE_CORE_LIVE_SMOKE') != '1' or os.environ.get('CI') or os.environ.get('GITHUB_ACTIONS'):
    raise SystemExit('Explicit paid opt-in outside CI required')
bounded = os.environ.get('DAGMAR_NATIVE_BOUNDED') == '1'
compact_control = os.environ.get('DAGMAR_NATIVE_COMPACT_CONTROL') == '1'
two_responses = os.environ.get('DAGMAR_NATIVE_TWO_RESPONSES') == '1'
assert not two_responses or compact_control
assert not compact_control or bounded
key = sys.stdin.readline().strip()
if not key:
    raise SystemExit('Provider key required on stdin')
root = Path(os.environ['DAGMAR_NATIVE_DATA'])
root.mkdir(parents=True, exist_ok=True, mode=0o700)
ledger = PaidBudget(os.environ['DAGMAR_PAID_LEDGER'])
engine = create_engine('sqlite:///' + str(root/'memory.db'), hide_parameters=True)
upgrade(engine)
factory = sessionmaker(bind=engine)
with factory() as db:
    db.execute(update(VoiceMemorySettings).where(VoiceMemorySettings.principal_id==SHARED_ID).values(automatic=False))
    db.commit()
fixture = json.loads((Path(__file__).parent/'native-test-catalog.json').read_text())
results, events, calls = {}, [], []
state = {'bridge':None, 'reservation':None, 'created':0, 'ended':False}

# Small final allowance: <=3 responses, 512 output tokens, 10 seconds of input.
# <=3*((12000+1024)*4 + (1024+1000)*32 + 512*64)/1e6 = .448896 USD.
# Compact-control mode enforces <=10000 initial text tokens: .424992 USD,
# reserved .43 plus .02 for missing transcription; no exact mail readback test.
# Two-response case reserves .30; native final response closes before continuation.
# All output limits are test-only; production retains 4096 and native model.
class FakeHA:
    room_ref_supported = True
    async def call_tool(self, name, payload):
        assert name == 'smart_technologie' and payload['api_version'] == 2
        calls.append({'operation':payload['operation'], 'request_id':payload.get('request_id')})
        op = payload['operation']
        value = {'catalog_revision':'r1','results':[]}
        if op == 'catalog':
            if compact_control:
                value = {**fixture}
            value['overview'] = {'device_count':1,'locations':['Testovna'],'kinds':['light']}
        elif op == 'search':
            value.update(total=1,has_more=False,matches=[{'row':8,'name':'Zkušební lampa','location':'Testovna','kind':'light'}])
        elif op in {'describe','read'}:
            value = fixture
        elif op in {'control','operation_status'}:
            value.update(summary={'accepted':1},operation={'status':'accepted'},results=[{'row':8,'status':'accepted'}])
        else:
            value['error']={'code':'unsupported_test_operation'}
        return CallToolResult(content=[TextContent(type='text',text=json.dumps(value))],isError=False)

@asynccontextmanager
async def ha(token):
    assert token == 'isolated-public-contract'
    yield FakeHA()

async def finish():
    if state['ended']:
        return
    state['ended']=True
    bridge=state['bridge']
    if bridge:
        await bridge.close()
        await bridge.hangup()
    reservation=state['reservation']
    if reservation:
        complete=bool(results) and len(results)==state['created'] and all(r['cost_estimate']['complete'] for r in results.values())
        total=sum((Decimal(r['cost_estimate']['usd']) for r in results.values() if r['cost_estimate']['complete']),Decimal(0))
        ledger.reconcile(reservation,str(total) if complete else None,complete=complete)
        ledger.reconcile(reservation+'-transcription',None,complete=False)
    (root/'result.json').write_text(json.dumps({'model':'gpt-realtime-2.1','provider_usage':list(results.values()),'events':events,'fake_mcp_calls':calls,'ledger':ledger.snapshot(),'physical_acoustics':False},indent=2)+'\n')

class Socket:
    def __init__(self, socket): self.socket=socket
    async def send(self, raw):
        event=json.loads(raw)
        if two_responses and event['type']=='response.create' and len(results)>=2:
            raise RuntimeError('native_test_response_budget')
        if event['type']=='session.update' and event.get('session',{}).get('instructions'):
            assert measure(json.dumps(event['session'])).tokens<=(10000 if compact_control else 12000 if bounded else 20000)
            if bounded:
                event['session']['max_output_tokens']=512
                raw=json.dumps(event)
        await self.socket.send(raw)
    def __aiter__(self): return self
    async def __anext__(self):
        raw=await self.socket.recv()
        event=json.loads(raw)
        typ=event.get('type')
        if typ=='response.created':
            state['created']+=1
            if state['created']>=(3 if bounded else 6):
                asyncio.create_task(finish())
                raise StopAsyncIteration
        if typ=='response.done':
            response=event.get('response',{})
            if response.get('id'):
                results[response['id']]=usage_record(response,'gpt-realtime-2.1')
        if two_responses and event.get('type')=='output_audio_buffer.stopped' and len(results)>=2 and event.get('response_id') in results:
            asyncio.create_task(finish())
        if typ in {'response.created','response.done','input_audio_buffer.speech_started','output_audio_buffer.started','output_audio_buffer.stopped','error'}:
            events.append({'type':typ,'status':event.get('response',{}).get('status'),'concise_success':any(part.get('transcript','').strip().casefold().strip('.! ')== 'hotovo' for item in event.get('response',{}).get('output',[]) for part in item.get('content',[]) if part.get('type') in {'audio','output_audio'}),'response_id':event.get('response_id') or event.get('response',{}).get('id'),'code':event.get('error',{}).get('code')})
        return raw

@asynccontextmanager
async def socket(*args, **kwargs):
    async with connect(*args,**kwargs) as ws:
        yield Socket(ws)

settings=DagmarSettings(voice_master_key=base64.b64encode(os.urandom(32)).decode(),ha_mcp_token='isolated-public-contract')
def identity(owner):
    return {'session_id':'native-test','namespace':'native-test','email':'native@example.invalid','voice_authorized':True} if owner=='native-test' else None
product=DagmarApplication(RuntimePorts(factory,settings,identity,request_identity=lambda request:identity('native-test'),provider_socket=socket,ha_connector=ha),Diagnostics(root/'diagnostics',base64.b64encode(os.urandom(32)).decode(),release='native-local-test'))
app=FastAPI()
app.add_middleware(BoundContext,ports=product.ports)

@app.get('/')
def page(): return HTMLResponse('<button id="start">Native test</button>')

@app.post('/offer')
async def offer(request:Request):
    assert state['reservation'] is None
    reservation='native-'+uuid4().hex
    ledger.reserve(reservation,'.30' if two_responses else '.43' if compact_control else '.47' if bounded else '9.40','gpt-realtime-2.1',SNAPSHOT['revision'])
    ledger.reserve(reservation+'-transcription','.02' if bounded else '.10','gpt-4o-mini-transcribe',SNAPSHOT['revision'])
    state['reservation']=reservation
    logical=uuid4().hex
    with factory() as db:
        db.add(LogicalCall(id=logical,owner_session_id='native-test'))
        db.commit()
    config=VoiceCoreConfig(model_mode='manual',manual_model='gpt-realtime-2.1',language_mode='manual',manual_language='cs',response_length='short')
    answer=await product.manager.create((await request.body()).decode(),config,key,'native-test',settings.ha_mcp_token,logical_call_id=logical)
    state['bridge']=product.manager.get(answer['session_id'],'native-test')
    async def timeout():
        await asyncio.sleep(10 if bounded else 90)
        await finish()
    asyncio.create_task(timeout())
    return answer

@app.post('/ready')
async def ready():
    await state['bridge'].greet()
    return {'ready':True}

@app.get('/status')
def status():
    bridge=state['bridge']
    return {'ready':bool(bridge and bridge.ready.is_set()),'technologies':bridge.technologies if bridge else 'none','responses':len(results),'events':events,'fake_mcp_calls':calls,'ended':state['ended']}

@app.post('/end')
async def end():
    await finish()
    return {'ended':True}

if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=8797,log_level='error')
