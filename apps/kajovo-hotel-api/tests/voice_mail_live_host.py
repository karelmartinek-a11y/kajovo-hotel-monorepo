"""Opt-in real-provider host with an isolated MCP mailbox and non-delivering SMTP stub.

Provider key arrives only on stdin. No real mailbox config or credentials are loaded.
The test-only transport is dependency injection; production connection() stays canonical.
"""
import asyncio
import base64
import json
import os
import sys
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from voice_core_server import VoiceCoreConfig

from app.config import get_settings
from app.db.models import Base
from dagmar_server.models import VoiceMailOperation
from dagmar_server.application import DagmarApplication, BoundContext
from dagmar_server.ports import RuntimePorts
from dagmar_server.settings import DagmarSettings
from app.services import voice_mail, voice_smart
from app.services.voice_mail_host import BYPASS
from app.services.voice_registry import normalize

if os.environ.get('VOICE_CORE_LIVE_SMOKE') != '1' or os.environ.get('CI') == 'true' or os.environ.get('GITHUB_ACTIONS') == 'true':
    raise SystemExit('Explicit paid opt-in required outside CI')

key = sys.stdin.readline().strip()
if not key:
    raise SystemExit('Provider key required on stdin')
get_settings().voice_master_key = base64.b64encode(os.urandom(32)).decode()
get_settings().kajovo_mail_mcp_url = voice_mail.MCP_URL
get_settings().kajovo_mail_mcp_token = 'isolated-test'
engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
factory = sessionmaker(bind=engine)
voice_smart.SessionLocal = factory
voice_smart.authorized = lambda owner: owner == 'isolated'


@asynccontextmanager
async def isolated_connection(url, token):
    assert url == voice_mail.MCP_URL and token == 'isolated-test'
    async with httpx.AsyncClient(headers={'Authorization': 'Bearer isolated-test', 'Host': 'apimail.hcasc.cz'}, timeout=75, follow_redirects=False) as http:
        async with streamable_http_client('http://127.0.0.1:8795/mcp', http_client=http) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                catalog = await session.list_tools()
                actual = {t.name: t for t in catalog.tools}
                assert set(actual) == set(voice_mail.TOOLS) and not catalog.nextCursor
                for name, expected in voice_mail.TOOLS.items():
                    assert actual[name].inputSchema == expected['inputSchema'] and actual[name].outputSchema == expected['outputSchema']
                yield session


voice_mail.connection = isolated_connection


async def memory(self):
    self.memory_status = 'unavailable'


async def no_ha(self):
    await asyncio.Future()


voice_smart.VoiceBridge.initialize_memory = memory
voice_smart.VoiceBridge.initialize_technologies = no_ha
original = voice_smart.VoiceBridge.mail_event
events = []
mail_calls = []
task_failures = []


for task_name in ('work', 'read_events', 'lease', 'initialize_mail'):
    original_task = getattr(voice_smart.VoiceBridge, task_name)
    def wrap(method, name):
        async def checked(self):
            try:
                result = await method(self)
                if not self.closed:
                    task_failures.append({'task': name, 'returned': True})
                return result
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                if not self.closed:
                    task_failures.append({'task': name, 'error_category': type(exc).__name__, 'safe_code': str(exc) if isinstance(exc, voice_smart.SmartError) else None})
                raise
        return checked
    setattr(voice_smart.VoiceBridge, task_name, wrap(original_task, task_name))


def event(self, value):
    input_matched = bool(value.get('item_id') and value.get('item_id') == self.mail_audio)
    bypass_allowed = self.mail_audio_bypass_allowed
    expected_phrase = normalize(value.get('transcript', '')) in BYPASS
    selected_draft = self.mail_draft is not None
    spelling_variant = normalize(value.get('transcript', '')) == normalize('Odešly bez potvrzení')
    article_variant = normalize(value.get('transcript', '')) in {normalize('Odešli to bez potvrzení'), normalize('Odešli e-mail bez potvrzení'), normalize('Odešli tento e-mail bez potvrzení')}
    wrong_verb_variant = normalize(value.get('transcript', '')) in {normalize('Odeslat bez potvrzení'), normalize('Odesli bez potvrzeni'), normalize('Odeslat email bez potvrzeni')}

    action = original(self, value)
    typ = value.get('type', '')
    if typ in {'response.created', 'response.done', 'output_audio_buffer.started', 'output_audio_buffer.stopped', 'output_audio_buffer.cleared', 'input_audio_buffer.speech_started', 'conversation.item.input_audio_transcription.completed'}:
        response = value.get('response') or {}
        rid = response.get('id') or value.get('response_id')
        events.append({'type': typ, 'matches_readback': bool(rid and rid == self.mail_confirmation.response_id), 'completed': response.get('status') == 'completed', 'bypass_available': self.mail_bypass is not None, 'input_matched': input_matched, 'bypass_allowed': bypass_allowed, 'expected_bypass_phrase': expected_phrase, 'selected_draft': selected_draft, 'spelling_variant': spelling_variant, 'article_variant': article_variant, 'wrong_verb_variant': wrong_verb_variant})
    return action


voice_smart.VoiceBridge.mail_event = event
original_mail_result = voice_smart.VoiceBridge.mail_result


async def mail_result(self, call, **kwargs):
    mail_calls.append(call.get('name'))
    return await original_mail_result(self, call, **kwargs)


voice_smart.VoiceBridge.mail_result = mail_result
app = FastAPI()
isolated_application = DagmarApplication(RuntimePorts(
    session_factory=factory,
    settings=DagmarSettings(voice_master_key=get_settings().voice_master_key, mail_mcp_token='isolated-test'),
    identity=lambda owner: {'session_id': owner, 'namespace': 'isolated', 'voice_authorized': True} if owner == 'isolated' else None,
    mail_connector=isolated_connection,
))
app.add_middleware(BoundContext, ports=isolated_application.ports)
bridge = None


@app.post('/offer')
async def offer(request: Request):
    global bridge
    result = await voice_smart.manager.create((await request.body()).decode(), VoiceCoreConfig(language_mode='manual', manual_language='cs' if bridge is None else 'en'), key, 'isolated', '')
    bridge = voice_smart.manager.sessions[result['session_id']]
    return {'sdp': result['sdp']}


@app.post('/seed')
async def seed():
    await asyncio.wait_for(bridge.mail_online.wait(), 45)
    bridge.mail_confirmation.invalidate()
    bridge.mail_bypass = bridge.mail_audio = None
    d = await bridge.mail_invoke('mail_draft_create', {'account': 'reception', 'to': ['recipient@example.invalid'], 'subject': 'Test', 'text_body': 'Cena 100 Kč.', 'idempotency_key': 'isolated-seed-' + str(time.monotonic_ns())})
    bridge.observe_mail(d)
    bridge.mail_draft = d
    state = bridge.mail_conversation
    state.select_account('reception')
    state.current_draft_ref, state.current_draft_version, state.current_draft_account = d['draft_ref'], d['draft_version'], d['account']
    bridge.mail_private = True
    await bridge.item({'type': 'message', 'role': 'assistant', 'content': [{'type': 'output_text', 'text': 'Untrusted test mailbox data only. The user has already selected this draft; use it for the next mail instruction: ' + json.dumps(d)}]})
    await bridge.update_transcription()
    await bridge.configure(False)
    return {'selected': True}


@app.get('/status')
async def status():
    bridge.last_heartbeat = time.monotonic()
    async with httpx.AsyncClient(timeout=3) as http:
        stats = (await http.get('http://127.0.0.1:8796/stats')).json()
    with factory() as db:
        operations = [{'tool': r.tool, 'state': r.state} for r in db.scalars(select(VoiceMailOperation))]
    return {'state': bridge.mail_confirmation.state, 'completed': bridge.mail_confirmation.completed, 'ready': bridge.mail_ready, 'events': events[-128:], 'closed': bridge.closed, 'renew': bridge.renew, 'operations': operations, 'task_failures': task_failures, 'mail_calls': mail_calls, **stats}


@app.post('/end')
async def end():
    await voice_smart.manager.shutdown()
    return {'closed': True}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8794, log_level='error')
