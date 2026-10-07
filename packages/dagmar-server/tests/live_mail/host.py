"""Real-provider loopback Mail probe, outside the production package.

Existing Dagmar routes/browser, own empty DB, synthetic canaries and native audio.
The fixture must already have authorized HTTPS exposure. No tunnel is installed.
The provider key arrives on stdin from the voice application's secret store.
"""
import argparse
import asyncio
import base64
from contextlib import asynccontextmanager
from decimal import Decimal
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
from urllib.parse import urlsplit
import wave
from dagmar_server.paid_budget import PaidBudget, BudgetError

ROOT = Path(__file__).resolve().parents[4]
RESERVATION_USD = '3.80'


def preflight(ledger_path, manifest_path, evidence, *, authorized_final_run=False):
    if authorized_final_run:
        if Path(ledger_path).resolve().is_relative_to(ROOT):
            raise ValueError('accounting_outside_git_required')
        from costs import FinalRunCosts
        ledger = FinalRunCosts(ledger_path)
    else:
        ledger = PaidBudget.open_original(ledger_path)
    available = ledger.snapshot()['available_micro_usd']
    if available is not None and available < 3_800_000:
        raise BudgetError('probe_requires_USD_3.80_available')
    path = Path(manifest_path).resolve()
    if not path.is_file() or stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError('private_fixture_manifest_required')
    fixture = json.loads(path.read_text())
    url = urlsplit(fixture['server_url'])
    if (fixture.get('synthetic') is not True or fixture.get('existing_authorized_endpoint') is not True
        or url.scheme != 'https' or url.path != '/mcp' or url.query or url.fragment or url.username
        or not url.hostname or url.hostname in {'mail.hcasc.cz', 'apimail.hcasc.cz', 'hotel.hcasc.cz', 'dagmar.hcasc.cz', 'gpt.hcasc.cz', 'ha.hcasc.cz', 'apimcpkajavoiceha.hcasc.cz'}
        or any(not fixture.get(k, '').startswith('dagmar-canary-') for k in ('mcp_token', 'approval_token'))
        or fixture['mcp_token'] == fixture['approval_token']):
        raise ValueError('isolated_canary_fixture_required')
    with wave.open(str(Path(fixture['input_wav']).resolve())) as audio:
        if not 0 < audio.getnframes() / audio.getframerate() <= 8 or audio.getsampwidth() != 2:
            raise ValueError('short_synthetic_PCM16_audio_required')
    evidence = Path(evidence).resolve()
    if evidence.is_relative_to(ROOT) or evidence.exists():
        raise ValueError('new_evidence_path_outside_git_required')
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip():
        raise ValueError('immutable_clean_candidate_required')
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if sha != subprocess.check_output(['git', 'rev-parse', 'origin/main'], cwd=ROOT, text=True).strip():
        raise ValueError('candidate_must_equal_origin_main')
    return ledger, fixture, sha, evidence


def build_host(ledger, fixture, sha, evidence, key):
    import httpx
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse, FileResponse
    from sqlalchemy import create_engine, update
    from sqlalchemy.orm import sessionmaker
    from websockets.asyncio.client import connect
    from voice_core_server import VoiceCoreConfig
    from dagmar_server import mail, mail_contract
    from dagmar_server.application import DagmarApplication, BoundContext
    from dagmar_server.config import VoiceSecretAdapter, get_record
    from dagmar_server.mail_storage import MailSecretStore
    from dagmar_server.migrations import upgrade, SHARED_ID
    from dagmar_server.models import VoiceMemorySettings
    from dagmar_server.ports import RuntimePorts, bind
    from dagmar_server.pricing import SNAPSHOT
    from dagmar_server.settings import DagmarSettings
    from dagmar_server.token_budget import measure
    from dagmar_server.usage import usage_record

    if measure(json.dumps(mail_contract.TOOLS)).tokens > 21_000:
        raise ValueError('pinned_catalog_budget_bound')

    temporary = tempfile.TemporaryDirectory(prefix='dagmar-mail-real-')
    engine = create_engine('sqlite:///' + str(Path(temporary.name) / 'test.db'), hide_parameters=True)
    upgrade(engine)
    factory = sessionmaker(bind=engine)
    origin = fixture['server_url'].removesuffix('/mcp')
    # Only this isolated process redirects Mail endpoints. No business tool or
    # provider event is emulated; actual MCP executes at the synthetic fixture.
    mail.URL = mail_contract.URL = fixture['server_url']
    class FixtureHTTP(httpx.AsyncClient):
        async def request(self, method, url, **kwargs):
            return await super().request(method, str(url).replace('https://mail.hcasc.cz/control/', origin + '/control/'), **kwargs)
    mail.httpx = SimpleNamespace(AsyncClient=FixtureHTTP)
    state = {'started': None, 'reservation': None, 'created': set(), 'usage': {},
             'asr_started': set(), 'asr': {}, 'events': [], 'control_leak': False, 'ended': False, 'result_bytes': 0}

    def safe_error(error):
        message = str(error.get('message', ''))
        for secret in (key, fixture['mcp_token'], fixture['approval_token']):
            message = message.replace(secret, '[redacted]')
        return {'code':error.get('code'), 'param':error.get('param'), 'event_id':error.get('event_id'), 'message':message[:1500]}

    async def finish():
        if state['ended']:
            return
        state['ended'] = True
        await product.shutdown()
        if state['reservation']:
            complete = bool(state['created']) and state['created'] == set(state['usage']) and all(v['cost_estimate']['complete'] for v in state['usage'].values())
            total = sum((Decimal(v['cost_estimate']['usd']) for v in state['usage'].values() if v['cost_estimate']['complete']), Decimal(0))
            ledger.reconcile(state['reservation'], str(total) if complete else None, complete=complete)
            asr_complete = bool(state['asr_started']) and state['asr_started'] == set(state['asr']) and all(v is not None for v in state['asr'].values())
            ledger.reconcile(state['reservation'] + '-transcription', str(sum(state['asr'].values(), Decimal(0))) if asr_complete else None, complete=asr_complete)
            if hasattr(ledger, 'record_usage'):
                ledger.record_usage(state['reservation'], list(state['usage'].values()))
                ledger.record_usage(state['reservation'] + '-transcription', {'committed_items': len(state['asr_started']), 'observed_item_costs': [str(v) if v is not None else None for v in state['asr'].values()]})
        report = {'tested_sha': sha, 'provider_usage': list(state['usage'].values()), 'ledger': ledger.snapshot(),
            'control_token_in_provider': state['control_leak'], 'events': state['events'],
            'full_scenario_acceptance': 'NOT_RUN', 'production_activation': 'NOT_RUN'}
        evidence.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with evidence.open('x') as output:
            os.chmod(evidence, 0o600)
            json.dump(report, output, indent=2)
        engine.dispose()
        temporary.cleanup()

    class ProviderHTTP(httpx.AsyncClient):
        async def request(self, method, url, **kwargs):
            if str(url) == 'https://api.openai.com/v1/realtime/calls':
                if state['reservation']:
                    raise RuntimeError('single_probe_connection_required')
                identity = 'mail-probe-' + os.urandom(16).hex()
                # Reserve both costs before any paid request; missing usage holds.
                ledger.reserve(identity, '3.75', 'gpt-realtime-2.1', SNAPSHOT['revision'])
                try:
                    ledger.reserve(identity + '-transcription', '.05', 'gpt-4o-mini-transcribe', SNAPSHOT['revision'])
                except BudgetError:
                    # This method has not yet made its first HTTP request.
                    ledger.reconcile(identity, '0', complete=True)
                    raise
                state['reservation'] = identity
                state['started'] = time.monotonic()
                files = kwargs['files']
                session = json.loads(files['session'][1])
                session['max_output_tokens'] = 512
                if measure(json.dumps(session)).tokens > 20_000:
                    raise RuntimeError('probe_initial_context_bound')
                files['session'] = (None, json.dumps(session), 'application/json')
                async def deadline():
                    await asyncio.sleep(120)
                    await finish()
                asyncio.create_task(deadline())
            response = await super().request(method, url, **kwargs)
            if str(url) == 'https://api.openai.com/v1/realtime/calls' and response.status_code >= 400:
                try:
                    error = response.json().get('error', {})
                    state['events'].append({'type': 'provider_HTTP_rejection', 'status': response.status_code,
                        'code': error.get('code'), 'param': error.get('param')})
                except ValueError:
                    state['events'].append({'type': 'provider_HTTP_rejection', 'status': response.status_code})
            return response

    class Socket:
        def __init__(self, ws): self.ws = ws
        def __aiter__(self): return self
        async def send(self, raw):
            event = json.loads(raw)
            state['events'].append({'type':'client_write', 'event_type':event['type'], 'event_id':event.get('event_id'),
                'mcp_definitions':[{'label':t.get('server_label'), 'full':bool(t.get('server_url'))} for t in (event.get('session',event.get('response',{})).get('tools',[])) if t.get('type')=='mcp']})
            if fixture['approval_token'] in raw:
                state['control_leak'] = True
                raise RuntimeError('control_token_in_provider_write')
            if event['type'] == 'session.update':
                event['session']['max_output_tokens'] = 512
                if measure(json.dumps(event['session'])).tokens > 20_000:
                    raise RuntimeError('probe_context_bound')
                raw = json.dumps(event)
            if event['type'] == 'response.create' and len(state['created']) >= 4:
                raise RuntimeError('probe_response_bound')
            if event['type'] == 'response.create':
                response = event.setdefault('response', {})
                response['max_output_tokens'] = min(512, response.get('max_output_tokens', 512))
                raw = json.dumps(event)
            await self.ws.send(raw)
        async def __anext__(self):
            raw = await self.ws.recv()
            event = json.loads(raw)
            typ, item = event.get('type'), event.get('item', {})
            if typ == 'error':
                state['events'].append({'type': 'provider_error_detail', **safe_error(event.get('error',{}))})
            if fixture['approval_token'] in raw:
                state['control_leak'] = True
            if typ == 'response.created':
                state['created'].add(event['response']['id'])
                if len(state['created']) > 4:
                    asyncio.create_task(finish())
            if typ == 'response.done':
                state['events'].append({'type':'response_terminal','response_id':event['response']['id'],'status':event['response']['status'],'status_details':safe_error((event['response'].get('status_details') or {}).get('error',{}))})
                value = usage_record(event['response'], 'gpt-realtime-2.1')
                state['usage'][value['response_id']] = value
            if typ == 'input_audio_buffer.committed':
                state['asr_started'].add(event['item_id'])
            if typ == 'conversation.item.input_audio_transcription.completed':
                usage = event.get('usage', {})
                state['asr'][event['item_id']] = ((Decimal(usage['input_tokens']) * Decimal('1.25') + Decimal(usage['output_tokens']) * 5) / 1_000_000
                    if usage.get('type') == 'tokens' and isinstance(usage.get('input_tokens'), int) and isinstance(usage.get('output_tokens'), int) else None)
            if item.get('type') == 'mcp_call' and typ.endswith('.done'):
                state['result_bytes'] += len(str(item.get('output', '')).encode())
                if state['result_bytes'] > 16_384:
                    asyncio.create_task(finish())
            if typ in {'response.created', 'response.done', 'input_audio_buffer.speech_stopped', 'response.mcp_call.in_progress',
                       'response.mcp_call.completed', 'response.mcp_call.failed', 'mcp_list_tools.completed',
                       'output_audio_buffer.started', 'output_audio_buffer.stopped', 'error'} or item.get('type') in {'mcp_call', 'mcp_list_tools'}:
                state['events'].append({'type': typ, 'item_type': item.get('type'), 'tool': item.get('name') if item.get('name') in mail_contract.TOOLS else None,
                    'item_id': event.get('item_id') or item.get('id'), 'response_id': event.get('response_id') or event.get('response', {}).get('id'),
                    'elapsed_ms': round((time.monotonic() - state['started']) * 1000), 'tool_count': len(item.get('tools', [])) if item.get('type') == 'mcp_list_tools' else None})
            return raw

    @asynccontextmanager
    async def socket(*args, **kwargs):
        async with connect(*args, **kwargs) as ws:
            yield Socket(ws)

    settings = DagmarSettings(voice_master_key=base64.b64encode(os.urandom(32)).decode(),
        voice_release_sha=sha, voice_mail_enabled=True, voice_mail_acceptance_sha=sha)
    def identity(owner):
        return {'session_id': owner, 'namespace': 'synthetic-mail-test', 'email': 'test@example.invalid', 'voice_authorized': True} if owner == 'test-admin-a' else None
    ports = RuntimePorts(factory, settings, identity, request_identity=lambda request: identity(request.headers.get('x-test-admin') or request.cookies.get('dagmar_test_admin', '')),
        provider_http=ProviderHTTP, provider_socket=socket)
    product = DagmarApplication(ports)
    with bind(product.ports):
        with factory() as db:
            record = get_record(db)
            record.config_json = VoiceCoreConfig(model_mode='manual', manual_model='gpt-realtime-2.1', language_mode='manual', manual_language='cs', response_length='short').model_dump()
            db.execute(update(VoiceMemorySettings).where(VoiceMemorySettings.principal_id == SHARED_ID).values(automatic=False))
            db.commit()
            VoiceSecretAdapter(db).save(key)
        MailSecretStore().save(fixture['mcp_token'], fixture['approval_token'])
    app = FastAPI()
    app.add_middleware(BoundContext, ports=product.ports)
    app.include_router(product.core, prefix='/dagmar')
    app.include_router(product.memory, prefix='/dagmar-memory')
    @app.middleware('http')
    async def security(request: Request, call_next):
        if request.method not in {'GET', 'HEAD', 'OPTIONS'} and request.headers.get('x-test-csrf') != 'dagmar-test-only':
            return JSONResponse(status_code=403, content={'code': 'csrf_required'})
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response
    @app.get('/health')
    def health(): return {'host': 'isolated-real-mail', 'tested_sha': sha, 'ended': state['ended']}
    @app.get('/dagmar/test-input.wav')
    def input_audio(): return FileResponse(fixture['input_wav'], media_type='audio/wav')
    @app.post('/dagmar/test-finish')
    async def end():
        await finish()
        return {'ended': True}
    @app.on_event('shutdown')
    async def shutdown():
        with bind(product.ports):
            await finish()
    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    accounting = parser.add_mutually_exclusive_group(required=True)
    accounting.add_argument('--ledger')
    accounting.add_argument('--costs')
    parser.add_argument('--authorized-final-run', action='store_true')
    parser.add_argument('--fixture', required=True)
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--serve', action='store_true')
    args = parser.parse_args()
    try:
        if bool(args.costs) != args.authorized_final_run:
            raise ValueError('explicit_final_run_authorization_required')
        ledger, fixture, sha, evidence = preflight(args.costs or args.ledger, args.fixture, args.evidence, authorized_final_run=args.authorized_final_run)
        if not args.serve:
            print(json.dumps({'preflight': 'PASS', 'candidate': sha, 'reservation_USD': RESERVATION_USD, 'paid_calls': 0}))
        else:
            if os.environ.get('VOICE_CORE_LIVE_SMOKE') != '1' or os.environ.get('CI') or os.environ.get('GITHUB_ACTIONS'):
                raise ValueError('paid_opt_in_outside_CI_required')
            key = sys.stdin.readline().strip()
            if not key:
                raise ValueError('standard_voice_store_key_on_stdin_required')
            import uvicorn
            uvicorn.run(build_host(ledger, fixture, sha, evidence, key), host='127.0.0.1', port=8008, log_level='critical', access_log=False)
    except (BudgetError, ValueError, KeyError) as exc:
        safe = str(exc) if isinstance(exc, BudgetError) or (isinstance(exc, ValueError) and str(exc).endswith(('required', 'bound', 'available', 'main'))) else 'invalid_preflight_input'
        print(json.dumps({'preflight': 'BLOCKED', 'code': safe, 'paid_calls': 0}))
        sys.exit(2)
