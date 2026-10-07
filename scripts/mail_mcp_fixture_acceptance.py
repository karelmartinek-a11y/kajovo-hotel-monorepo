"""Actual copied Mail MCP + TLS fixture, never production configuration or mail.

Run with the copied server's SDK/runtime. This is a protocol test, NOT Realtime
or voice-model/audio acceptance. No payloads or credentials enter its report.
"""
import argparse
import asyncio
import hashlib
import importlib
import json
import os
from pathlib import Path
import secrets
import socket
import sys
import tempfile
import time
import traceback

PROGRESS = []


def isolated_source(source):
    # Resolve both sides: macOS /tmp is a symlink to /private/tmp.
    source = source.resolve()
    roots = {Path('/tmp').resolve(), Path(tempfile.gettempdir()).resolve()}
    if source.parent not in roots or not source.name.startswith('dagmar-mail-fixture-'):
        raise RuntimeError('isolated_source_copy_required')
    return source


async def run(source):
    # A production source path is rejected: this harness imports only the copy.
    source = isolated_source(source)
    sys.path.insert(0, str(source))
    from fixture import Fixture
    import httpx2
    from mcp import Client
    from mcp.client.streamable_http import streamable_http_client
    import uvicorn

    with tempfile.TemporaryDirectory(prefix='dagmar-mail-fixture-data-') as directory:
        root = Path(directory)
        fixture = Fixture(root)
        token, control_token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        auth = {'clients':[{'id':'isolated','token_hash':hashlib.sha256(token.encode()).hexdigest(),'accounts':['recepce','provoz'],'roles':['read','write','send'],'enabled':True}],
                'approvers':[{'owner':'isolated','token_hash':hashlib.sha256(control_token.encode()).hexdigest(),'accounts':['recepce','provoz'],'enabled':True}]}
        (root/'auth.json').write_text(json.dumps(auth))
        config = {'accounts':fixture.config,'auth_file':str(root/'auth.json'),'database':str(root/'mail.sqlite3'),'synthetic':True}
        (root/'config.json').write_text(json.dumps(config))
        os.environ['MAIL_MCP_CONFIG'] = str(root/'config.json')
        module = importlib.import_module('app')
        sock = socket.socket()
        sock.bind(('127.0.0.1',0))
        sock.listen(128)
        base = 'http://127.0.0.1:' + str(sock.getsockname()[1])
        server = uvicorn.Server(uvicorn.Config(module.application,log_level='critical',access_log=False))
        task = asyncio.create_task(server.serve(sockets=[sock]))
        report = {'source':'immutable_server_copy_with_TLS_IMAP_SMTP_fixture','Realtime':'NOT_RUN_BY_OWNER_POLICY','audio':'NOT_RUN_BY_OWNER_POLICY','tests':PROGRESS,
                  'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in source.glob('*.py')}}
        try:
            async with asyncio.timeout(10):
                while not server.started:
                    if task.done():
                        raise RuntimeError('isolated_server_start_failed')
                    await asyncio.sleep(.01)
            async with httpx2.AsyncClient(headers={'Authorization':'Bearer '+token},timeout=60) as http:
                async with Client(streamable_http_client(base+'/mcp',http_client=http),mode='legacy') as client:
                    tools = await client.list_tools()
                    assert len(tools.tools) == 23
                    # Compare the immutable server copy against the host's pinned contract.
                    catalog = json.loads((Path(__file__).resolve().parents[1]/'packages/dagmar-server/src/dagmar_server/mail_mcp_catalog.json').read_text())
                    actual = {tool.name: tool.model_dump(by_alias=True, exclude_none=True) for tool in tools.tools}
                    assert set(actual) == {tool['name'] for tool in catalog}
                    for tool in catalog:
                        assert all(actual[tool['name']].get(field) == tool.get(field) for field in ('inputSchema','outputSchema','annotations'))
                    report['tests'].append('catalog_23')
                    from models import Result
                    async def call(name, arguments):
                        value = await client.call_tool(name,arguments)
                        result = value.structured_content
                        Result.model_validate(result)
                        return result
                    scope = {'accounts':['recepce','provoz'],'folders':{'recepce':['INBOX'],'provoz':['INBOX']}}
                    all_count = await call('mail_scope_status',{'scope':{'accounts':['recepce','provoz']}})
                    assert all_count['total_count'] == 50000 and all_count['coverage_complete']
                    report['tests'].append('exact_total_50000')
                    unread = await call('mail_search',{'request':{'scope':scope,'query':{'op':'filter','field':'seen','match':'exact','value':False},'mode':'count'}})
                    assert unread['total_count'] == 26668 and unread['count_kind'] == 'exact'
                    for account in ('recepce','provoz'):
                        value = await call('mail_search',{'request':{'scope':{'accounts':[account],'folders':{account:['INBOX']}},'query':{'op':'filter','field':'seen','match':'exact','value':False},'mode':'count'}})
                        assert value['total_count'] == 13334
                    report['tests'].append('unread_counts_and_account_scope')
                    page = await call('mail_search',{'request':{'scope':scope,'fields':['identity','internal_date'],'page_size':100,'count_mode':'eager'}})
                    assert page['returned_count'] == 100 and page['total_count'] == 40000 and page['has_more'] and page['global_order_verified']
                    latest = max(range(1,20001),key=lambda uid:fixture.internal('recepce','INBOX',uid))
                    assert page['items'][0]['identity']['uid'] == latest
                    second = await call('mail_search',{'cursor':page['next_cursor']})
                    identities = lambda items: {json.dumps(item['identity'],sort_keys=True) for item in items}
                    assert second['returned_count'] == 100 and second['total_count'] == 40000
                    assert not identities(page['items']) & identities(second['items'])
                    assert page['items'][-1]['internal_date'] >= second['items'][0]['internal_date']
                    report['tests'].append('global_latest_100_page_is_not_total_and_pagination')
                    # Same 50,000 messages, but the newest now lives in another account/folder.
                    # Changing synthetic chronology is dataset setup, never a model/tool router.
                    from datetime import timedelta
                    original_internal = fixture.internal
                    newest_date = max(original_internal(a,f,i) for a,folders in fixture.folders.items() for f,items in folders.items() for i in items) + timedelta(days=1)
                    fixture.internal = lambda a,f,i: newest_date if (a,f,i)==('provoz','Archive',1) else original_internal(a,f,i)
                    global_page = await call('mail_search',{'request':{'scope':{'accounts':['recepce','provoz']},'fields':['identity','internal_date'],'page_size':1,'count_mode':'eager'}})
                    assert global_page['global_order_verified'] and global_page['total_count']==50000
                    assert global_page['items'][0]['identity']=={'account':'provoz','folder':'Archive','uidvalidity':101,'uid':1}
                    report['tests'].append('global_newest_cross_account_folder_not_highest_UID')
                    identity = {'account':'recepce','folder':'INBOX','uidvalidity':100,'uid':8000}
                    metadata = await call('mail_message_read',{'identity':identity,'mode':'metadata'})
                    attachments = metadata['items'][0]['attachments']
                    assert attachments['count'] == 2
                    assert {item['mime_type'] for item in attachments['items']} == {'application/pdf','image/png'}
                    html = await call('mail_message_read',{'identity':{**identity,'uid':8001},'mode':'full'})
                    encoded = await call('mail_message_read',{'identity':{**identity,'uid':8002},'mode':'full'})
                    assert 'Čeština & HTML' in html['items'][0]['text'] and '<script>' not in html['items'][0]['text']
                    assert 'Příliš žluťoučký kůň' in encoded['items'][0]['text']
                    report['tests'].append('MIME_charset_HTML_and_attachment_metadata')
                    text, cursor, parts = '', None, 0
                    while True:
                        value = await call('mail_message_read',{'identity':identity,'mode':'full','max_chars':4000,**({'cursor':cursor} if cursor else {})})
                        message = value['items'][0]
                        text += message['text']
                        parts += 1
                        cursor = message['load'].get('next_text_cursor')
                        if message['load']['complete_text']:
                            assert not cursor
                            break
                        assert cursor and parts < 40
                    expected = fixture.message('recepce','INBOX',8000).get_body(preferencelist=('plain',)).get_content()
                    assert text.strip() == expected.strip() and parts > 1
                    report['tests'].append('complete_text_all_cursors')
                    injection = await call('mail_message_read',{'identity':{**identity,'uid':8003},'mode':'full'})
                    assert injection['items'][0]['untrusted_content'] and fixture.metrics['smtp_submissions'] == 0
                    report['tests'].append('untrusted_result_marker_only_model_interpretation_NOT_RUN')
                    fixture.fail_folders.add(('provoz','INBOX'))
                    partial = await call('mail_scope_status',{'scope':scope})
                    assert partial['errors'] and not partial['coverage_complete'] and partial['total_count'] is None and partial['count_kind'] != 'exact'
                    fixture.fail_folders.clear()
                    report['tests'].append('partial_scope_never_complete')
                    content = {'account':'recepce','to':['synthetic@example.invalid'],'subject':'Synthetic only','text':'Ve čtvrtek.'}
                    draft = (await call('mail_draft_create',{'content':content}))['data']
                    old_request = (await call('mail_send_prepare',{'draft_id':draft['draft_id'],'expected_version':draft['version']}))['data']
                    changed = (await call('mail_draft_update',{'draft_id':draft['draft_id'],'expected_version':draft['version'],'content':{**content,'account':'provoz','text':'V pátek.'}}))['data']
                    assert changed['draft_id']==draft['draft_id'] and changed['version']>draft['version'] and changed['content']['account']=='provoz'
                    stale = await call('mail_draft_update',{'draft_id':draft['draft_id'],'expected_version':draft['version'],'content':content})
                    assert stale['errors']
                    async with httpx2.AsyncClient(headers={'Authorization':'Bearer '+control_token}) as control:
                        changed_approval = await control.post(base+'/control/approve',json={'send_request_id':old_request['send_request_id'],'content_hash':old_request['content_hash']})
                        assert changed_approval.status_code == 400
                    expired = (await call('mail_send_prepare',{'draft_id':changed['draft_id'],'expected_version':changed['version']}))['data']
                    # Only the disposable fixture DB is edited to exercise expiry deterministically.
                    module.core.store.db.execute('UPDATE requests SET expires=? WHERE id=?',(time.time()-1,expired['send_request_id']))
                    expired_send = await call('mail_send_execute',{'send_request_id':expired['send_request_id'],'idempotency_key':'expired-fixture-send'})
                    assert expired_send['errors'] and fixture.metrics['smtp_submissions']==0
                    async with httpx2.AsyncClient(headers={'Authorization':'Bearer '+control_token}) as control:
                        expired_approval = await control.post(base+'/control/approve',json={'send_request_id':expired['send_request_id'],'content_hash':expired['content_hash']})
                        assert expired_approval.status_code == 400
                    report['tests'].append('changed_version_and_expired_request_cannot_approve_or_send')
                    prepared = (await call('mail_send_prepare',{'draft_id':changed['draft_id'],'expected_version':changed['version']}))['data']
                    key = 'isolated-'+secrets.token_hex(12)
                    refused = await call('mail_send_execute',{'send_request_id':prepared['send_request_id'],'idempotency_key':key})
                    assert refused['errors'] and fixture.metrics['smtp_submissions'] == 0
                    async with httpx2.AsyncClient(headers={'Authorization':'Bearer '+control_token}) as control:
                        review = await control.get(base+'/control/requests/'+prepared['send_request_id'])
                        assert review.status_code == 200 and review.json()['content_hash'] == prepared['content_hash']
                        mismatch = await control.post(base+'/control/approve',json={'send_request_id':prepared['send_request_id'],'content_hash':'0'*64})
                        assert mismatch.status_code==400 and fixture.metrics['smtp_submissions']==0
                        approved = await control.post(base+'/control/approve',json={'send_request_id':prepared['send_request_id'],'content_hash':prepared['content_hash']})
                        assert approved.status_code == 200
                    sent = await call('mail_send_execute',{'send_request_id':prepared['send_request_id'],'idempotency_key':key})
                    assert sent['data']['state'] == 'smtp_accepted'
                    repeated = await call('mail_send_execute',{'send_request_id':prepared['send_request_id'],'idempotency_key':key})
                    assert repeated['data']['idempotent_replay'] and fixture.metrics['smtp_submissions'] == 1
                    assert fixture.submissions[0]['auth'] == 'provoz@hotelchodovasc.cz'
                    status = await call('mail_send_status',{'idempotency_key':key})
                    assert status['data']['state']=='smtp_accepted' and fixture.metrics['smtp_submissions']==1
                    # Reconnect recovery checks the original send identity; no new send attempt.
                    async with Client(streamable_http_client(base+'/mcp',http_client=http),mode='legacy') as reconnected:
                        recovered = (await reconnected.call_tool('mail_send_status',{'idempotency_key':key})).structured_content
                        assert recovered['data']['send_request_id']==prepared['send_request_id'] and recovered['data']['state']=='smtp_accepted'
                    assert fixture.metrics['smtp_submissions']==1
                    report['tests'].append('original_send_status_and_reconnect_no_resend')
                    # Simulate a durable uncertain journal, not fake provider events or SMTP success.
                    unknown_key='synthetic-uncertain-journal'
                    module.core.store.db.execute('INSERT INTO sends VALUES(?,?,?,?,?,?)',('isolated',unknown_key,prepared['send_request_id'],prepared['content_hash'],'outcome_unknown',json.dumps({'send_request_id':prepared['send_request_id']})))
                    unknown = await call('mail_send_status',{'idempotency_key':unknown_key})
                    replay = await call('mail_send_execute',{'send_request_id':prepared['send_request_id'],'idempotency_key':unknown_key})
                    assert unknown['data']['state']==replay['data']['state']=='outcome_unknown' and replay['data']['idempotent_replay']
                    assert fixture.metrics['smtp_submissions']==1
                    report['tests'].append('simulated_uncertain_journal_status_and_idempotent_no_resend')
                    report['tests'].append('draft_version_sender_control_approval_one_synthetic_SMTP')
            report['smtp_attempts'] = fixture.metrics['smtp_submissions']
            report['status'] = 'PASS'
            return report
        finally:
            server.should_exit = True
            await asyncio.wait_for(task,10)
            fixture.stop()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source',type=Path,required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(asyncio.run(run(args.source)),indent=2))
    except Exception as exc:
        def safe_failure(error):
            return {'type':type(error).__name__, 'frames':[{'file':Path(frame.filename).name,'line':frame.lineno} for frame in traceback.extract_tb(error.__traceback__)],
                    'causes':[safe_failure(child) for child in getattr(error,'exceptions',[])]}
        print(json.dumps({'status':'FAIL','failure':safe_failure(exc),'completed_tests':PROGRESS,'Realtime':'NOT_RUN_BY_OWNER_POLICY','audio':'NOT_RUN_BY_OWNER_POLICY'}))
        raise SystemExit(1) from None
