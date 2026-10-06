"""Run inside the deployed API: actual VoiceBridge executor, read-only MCP only.

No provider/audio request, production DB access, draft or mailbox mutation.
Only safe scope/tool/count/completion metadata is printed; mail text stays local.
"""
import asyncio
import hashlib
import json
import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from voice_core_server import VoiceCoreConfig
from app.config import get_settings
from dagmar_server import mail
from dagmar_server.orchestration import VoiceBridge
from dagmar_server.ports import RuntimePorts, bind
from dagmar_server.settings import DagmarSettings


async def verify():
    settings = get_settings()
    factory = sessionmaker(bind=create_engine('sqlite://'))
    ports = RuntimePorts(session_factory=factory,
        settings=DagmarSettings(mail_mcp_token=settings.kajovo_mail_mcp_token),
        identity=lambda owner: {'namespace': 'readonly-acceptance', 'voice_authorized': True})
    calls, headers, traces = [], [], []
    original_http = mail.httpx.AsyncClient
    async def observe(request):
        headers.append(request.headers.get('X-Mail-Contract'))
    class ObservedHTTP(original_http):
        def __init__(self, **kwargs):
            kwargs['event_hooks'] = {'request': [observe]}
            super().__init__(**kwargs)
    mail.httpx.AsyncClient = ObservedHTTP
    class SafeTrace(logging.Handler):
        def emit(self, record):
            if record.getMessage() == 'voice.mail.scope':
                traces.append(record.context)
    logger = logging.getLogger('dagmar.voice')
    logger.handlers = [SafeTrace()]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    with bind(ports):
        async with mail.connection(mail.MCP_URL, settings.kajovo_mail_mcp_token) as session:
            catalog = await session.list_tools()
            assert {t.name for t in catalog.tools} == set(mail.TOOLS)
            keys = ('name', 'inputSchema', 'outputSchema', 'annotations')
            actual = [{k: t.model_dump(by_alias=True, exclude_none=True)[k] for k in keys} for t in catalog.tools]
            expected = [{k: t[k] for k in keys} for t in mail.CATALOG['tools']]
            def canonical(tools):
                return json.dumps(sorted(tools, key=lambda t: t['name']), sort_keys=True, separators=(',', ':')).encode()
            assert canonical(actual) == canonical(expected)
            catalog_hash = hashlib.sha256(canonical(actual)).hexdigest()
            class ReadOnly:
                async def call_tool(self, name, args):
                    if not mail.TOOLS[name]['annotations']['readOnlyHint']:
                        raise AssertionError('Mutation prohibited')
                    result = await session.call_tool(name, args)
                    value = mail.decode(name, result)
                    calls.append({'tool': name, 'account': args.get('account'),
                        'folder_role': args.get('folder_role'), 'folder': args.get('folder') or value.get('resolved_folder'),
                        'complete': value.get('complete', value.get('body_complete')), 'success': True})
                    return result
            host = VoiceBridge('readonly-acceptance', 'mail-v2', '', '', VoiceCoreConfig(), 'unused')
            host.mail_mcp, host.mail_ready, host.mail_state = ReadOnly(), True, 'ready'
            checks = []
            for account in ('reception', 'operations'):
                state = host.mail_conversation
                state.select_account(account)
                state.selected_folder_role = 'inbox'
                state.intent = 'MAIL_COUNT'
                start = len(calls)
                result = await host.mail_execute('MAIL_COUNT', {}, '', 'count-' + account)
                assert result.isdecimal() and len(calls) == start + 1
                assert calls[-1]['tool'] == 'mail_messages_count' and calls[-1]['complete'] is True
                checks.append({'scenario': 'count', 'account': account, 'count': int(result), 'status': 'PASS'})
                start = len(calls)
                await host.mail_execute('MAIL_COUNT', {}, 'Kolik jich je?', 'count-followup-' + account)
                if len(calls) != start + 1 or calls[-1]['tool'] != 'mail_messages_count':
                    raise mail.MailError('FRESH_COUNT_REQUIRED')
                checks.append({'scenario': 'fresh-followup-count', 'account': account, 'status': 'PASS'})
                state.intent = 'MAIL_LATEST'
                start = len(calls)
                body = await host.mail_execute('MAIL_LATEST', {}, '', 'latest-' + account)
                assert calls[start]['tool'] == 'mail_messages_search' and calls[start]['folder_role'] == 'inbox'
                assert state.current_message_account == account and state.current_result_set_ref
                body_calls = calls[start + 1:]
                assert body_calls and all(c['tool'] == 'mail_message_get_body' and c['account'] == account for c in body_calls)
                assert body_calls[-1]['complete'] is True
                del body
                checks.append({'scenario': 'latest/full-body', 'account': account, 'body_pages': len(body_calls), 'status': 'PASS'})
                state.intent = 'MAIL_ATTACHMENTS'
                start = len(calls)
                attachments = await host.mail_execute('MAIL_ATTACHMENTS', {}, '', 'attachments-' + account)
                del attachments
                assert len(calls) > start and all(c['tool'] == 'mail_message_get_metadata' and c['account'] == account and c['folder'] == state.current_message_folder for c in calls[start:])
                checks.append({'scenario': 'attachment-metadata-scope', 'account': account, 'status': 'PASS'})
                wrong = 'operations' if account == 'reception' else 'reception'
                start = len(calls)
                try:
                    await host.mail_invoke('mail_message_get_body', {'account': wrong, 'message_ref': state.current_message_ref})
                except mail.MailError as exc:
                    assert str(exc) == 'REQUEST_SCOPE_MISMATCH'
                else:
                    raise AssertionError('Cross-account body accepted')
                assert len(calls) == start
                checks.append({'scenario': 'cross-account-before-body', 'account': account, 'status': 'PASS'})
    assert headers and set(headers) == {'mail-mcp/2'}
    assert any(t['tool_name'] == 'mail_messages_count' and t['result_complete'] is True for t in traces)
    assert any(t['operation_failure'] is True for t in traces)
    return {'status': 'PASS', 'contract': mail.CATALOG['contract_version'], 'header': 'X-Mail-Contract: mail-mcp/2',
            'executor': 'deployed dagmar_server.orchestration.VoiceBridge', 'production_mutations': 0,
            'provider_audio_tested': False, 'observed_http_contract_headers': sorted(set(headers)),
            'catalog_tools': sorted(t.name for t in catalog.tools), 'catalog_schema_annotations_sha256': catalog_hash,
            'checks': checks, 'safe_calls': calls, 'voice_mail_scope': traces}


if __name__ == '__main__':
    try:
        print(json.dumps(asyncio.run(verify()), ensure_ascii=False))
    except Exception as exc:
        # Exceptions from providers may contain payloads; fixed codes/categories only.
        pending, codes = [exc], []
        while pending:
            error = pending.pop()
            pending.extend(getattr(error, 'exceptions', ()))
            codes.append(str(error) if isinstance(error, mail.MailError) else type(error).__name__)
        print(json.dumps({'status': 'FAIL', 'codes': sorted(set(codes))}))
        raise SystemExit(1) from None
