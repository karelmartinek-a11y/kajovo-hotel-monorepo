"""Loopback-only development host with test auth and optional mock provider.

Uses only copied Dagmar/Voice Core packages, its own DB and no hotel source.
This is not another production login. Mock objects are constructor injections;
production hotel adapters never import this host or enable these transports.
"""
import asyncio
import base64
import json
import os
from pathlib import Path
from uuid import uuid4
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dagmar_server.application import DagmarApplication, BoundContext
from dagmar_server.migrations import upgrade
from dagmar_server.ports import RuntimePorts
from dagmar_server.settings import DagmarSettings

class MockProvider:
    def __init__(self):
        self.calls={}
    def http(self, **kwargs):
        def respond(request):
            if request.url.path == '/v1/realtime/calls':
                cid='rtc_mock_'+uuid4().hex
                self.calls[cid]=MockSocket()
                return httpx.Response(201,text='v=0\r\nmock-provider-answer',headers={'location':'https://api.openai.com/v1/realtime/calls/'+cid})
            return httpx.Response(200,json={})
        return httpx.AsyncClient(transport=httpx.MockTransport(respond))
    def socket(self, url, **kwargs):
        return self.calls[url.split('call_id=')[-1]]

class MockSocket:
    def __init__(self):
        self.events=asyncio.Queue()
    async def __aenter__(self):return self
    async def __aexit__(self,*args):return False
    def __aiter__(self):return self
    async def __anext__(self):return json.dumps(await self.events.get())
    async def send(self, raw):
        event=json.loads(raw)
        typ=event['type']
        if typ=='session.update':
            reply={'type':'session.updated','session':event['session']}
        elif typ=='conversation.item.create':
            reply={'type':'conversation.item.done','item':event['item']}
        elif typ=='conversation.item.delete':
            reply={'type':'conversation.item.deleted','item_id':event['item_id']}
        elif typ=='response.create':
            rid='response_'+uuid4().hex
            reply={'type':'response.created','response':{'id':rid,'metadata':event.get('response',{}).get('metadata',{})}}
            await self.events.put(reply)
            await self.events.put({'type':'output_audio_buffer.started','response_id':rid})
            await self.events.put({'type':'response.done','response':{'id':rid,'status':'completed','output':[],'usage':None}})
            await self.events.put({'type':'output_audio_buffer.stopped','response_id':rid})
            return
        else:
            return
        await self.events.put(reply)

root=Path(os.environ.get('DAGMAR_DATA','./data'))
root.mkdir(parents=True,exist_ok=True)
engine=create_engine(os.environ.get('DAGMAR_DB_URL','sqlite:///'+str(root/'dagmar.db')),hide_parameters=True)
upgrade(engine)
factory=sessionmaker(bind=engine)
settings=DagmarSettings(voice_master_key=base64.b64encode(bytes.fromhex('ab'*32)).decode())
active={'test-admin-a':True,'test-admin-b':True}
def identity(owner):
    return {'session_id':owner,'namespace':owner,'email':owner+'@example.invalid','voice_authorized':True} if active.get(owner) else None

def request_identity(request):return identity(request.headers.get('x-test-admin') or request.cookies.get('dagmar_test_admin',''))
mock=MockProvider() if os.environ.get('DAGMAR_MOCK_PROVIDER','1')=='1' else None
ports=RuntimePorts(factory,settings,identity,request_identity=request_identity,
    provider_http=mock.http if mock else None,provider_socket=mock.socket if mock else None)
product=DagmarApplication(ports)
app=FastAPI(title='Dagmar test host')
app.add_middleware(BoundContext,ports=product.ports)
app.include_router(product.core,prefix='/dagmar')
app.include_router(product.memory,prefix='/dagmar-memory')
@app.middleware('http')
async def test_security(request:Request,call_next):
    if request.method not in {'GET','HEAD','OPTIONS'} and request.headers.get('x-test-csrf')!='dagmar-test-only':
        return JSONResponse(status_code=403,content={'detail':{'code':'csrf_required'}})
    response=await call_next(request)
    response.headers['Cache-Control']='no-store'
    return response
@app.get('/health')
def health():return {'status':'ok','host':'test-auth','mock_provider':mock is not None}
@app.on_event('shutdown')
async def shutdown():await product.shutdown()
