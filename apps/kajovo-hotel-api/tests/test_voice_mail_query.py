"""Offline v2 transport/catalog/scope regressions; no real mailbox mutation."""
import asyncio
import copy
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest
from mcp.types import CallToolResult, Tool

from dagmar_server import mail
from dagmar_server.mail_query import MailQueryError, validate_result_scope


def count_result(**changes):
    return {'account': 'reception', 'resolved_folder': 'INBOX', 'resolved_folder_role': 'inbox',
            'resolved_folders': [{'account': 'reception', 'path': 'INBOX', 'role': 'inbox'}],
            'basis': 'synchronized_index', 'last_sync_at': '2026-10-06T01:00:00Z', 'reason': None,
            'count': 123, 'complete': True,
            'accounts': [{'account': 'reception', 'last_sync_at': None, 'index_complete': False, 'available': True}], **changes}


def test_direct_v2_count_keeps_folder_completeness_despite_incomplete_account():
    calls = []
    class Session:
        async def call_tool(self, name, args):
            calls.append((name, args))
            return CallToolResult(content=[], structuredContent={'contract_version': 'mail-mcp/2', 'request_id': 'fixture', 'ok': True, 'data': count_result()})
    result = asyncio.run(mail.invoke(Session(), 'mail_messages_count', {'account': 'reception', 'folder_role': 'inbox'}))
    assert result['count'] == 123 and result['complete']
    assert calls == [('mail_messages_count', {'account': 'reception', 'folder_role': 'inbox'})]


@pytest.mark.parametrize('changes', [
    {'account': 'operations'}, {'resolved_folder_role': 'archive'}, {'resolved_folder': 'Archive'},
    {'resolved_folders': []}, {'resolved_folders': [{'account': 'operations', 'path': 'INBOX', 'role': 'inbox'}]},
])
def test_wrong_resolved_count_scope_is_rejected(changes):
    with pytest.raises(MailQueryError, match='RESULT_SCOPE_MISMATCH'):
        validate_result_scope('mail_messages_count', {'account': 'reception', 'folder_role': 'inbox'}, count_result(**changes))


@pytest.mark.parametrize('name', ['mail_message_get_body', 'mail_message_get_metadata', 'mail_message_mark_read', 'mail_message_mark_unread', 'mail_message_move', 'mail_message_trash', 'mail_thread_get'])
def test_v2_singular_input_requires_explicit_account(name):
    with pytest.raises(mail.MailError, match='INVALID_INPUT'):
        mail.validate_input(name, {'message_ref': 'selected-reference'}, model=True)


@pytest.mark.parametrize('value', [
    {'message_ref': 'other-reference', 'account': 'reception'},
    {'message_ref': 'selected-reference', 'account': 'operations'},
])
def test_body_identity_and_account_are_independent_guards(value):
    with pytest.raises(MailQueryError, match='RESULT_SCOPE_MISMATCH'):
        validate_result_scope('mail_message_get_body', {'message_ref': 'selected-reference', 'account': 'reception'}, value)


@pytest.mark.parametrize('drift', [None, 'names', 'input', 'output', 'annotations', 'v1'])
def test_connection_requires_v2_header_and_exact_runtime_catalog(monkeypatch, drift):
    observed = []
    tools = [Tool.model_validate(copy.deepcopy(t)) for t in mail.CATALOG['tools']]
    assert {'mail_messages_count', 'mail_messages_batch_update'} <= {t.name for t in tools}
    if drift == 'names':
        tools.pop()
    elif drift == 'input':
        tools[0].inputSchema = {}
    elif drift == 'output':
        tools[0].outputSchema = {}
    elif drift == 'annotations':
        tools[0].annotations.readOnlyHint = False
    elif drift == 'v1':
        tools = [t for t in tools if t.name not in {'mail_messages_count', 'mail_messages_batch_update'}]
    @asynccontextmanager
    async def transport(url, http_client):
        observed.append((url, http_client.headers['X-Mail-Contract']))
        yield None, None, None
    class Session:
        def __init__(self, *a, **kw):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            pass
        async def initialize(self):
            pass
        async def list_tools(self):
            return SimpleNamespace(tools=tools, nextCursor=None)
    monkeypatch.setattr(mail, 'streamable_http_client', transport)
    monkeypatch.setattr(mail, 'ClientSession', Session)
    async def run():
        async with mail.connection(mail.MCP_URL, 'fixture-token'):
            assert drift is None
    if drift:
        with pytest.raises(mail.MailError, match='CONTRACT_MISMATCH'):
            asyncio.run(run())
    else:
        asyncio.run(run())
    assert observed == [(mail.MCP_URL, 'mail-mcp/2')]


def test_v1_envelope_cannot_be_accepted_by_v2_voice():
    result = CallToolResult(content=[], structuredContent={'contract_version': 'mail-mcp/1', 'request_id': 'fixture', 'ok': True, 'data': {'accounts': []}})
    with pytest.raises(mail.MailError, match='CONTRACT_MISMATCH'):
        mail.decode('mail_accounts_list', result)


def test_removed_search_count_extension_is_invalid():
    with pytest.raises(mail.MailError, match='INVALID_INPUT'):
        mail.validate_input('mail_messages_search', {'account': 'reception', 'result_mode': 'count'}, model=True)


def test_real_v2_batch_call_schema_and_partial_output():
    calls = []
    args = {'account': 'reception', 'message_refs': ['selected-ref-1', 'selected-ref-2'], 'action': 'mark_read', 'idempotency_key': 'fixture-operation-123'}
    data = {'account': 'reception', 'action': 'mark_read', 'requested_count': 2, 'succeeded_count': 1, 'failed_count': 1, 'complete': False,
            'results': [{'message_ref': 'selected-ref-1', 'account': 'reception', 'folder': 'INBOX', 'is_read': True, 'status': 'updated', 'ok': True},
                        {'message_ref': 'selected-ref-2', 'ok': False, 'status': 'failed', 'error': {'code': 'MESSAGE_NOT_FOUND', 'retryable': False, 'message': 'fixture'}}]}
    class Session:
        async def call_tool(self, name, arguments):
            calls.append((name, arguments))
            return CallToolResult(content=[], structuredContent={'contract_version': 'mail-mcp/2', 'request_id': 'fixture', 'ok': True, 'data': data})
    value = asyncio.run(mail.invoke(Session(), 'mail_messages_batch_update', args))
    assert value['complete'] is False and value['succeeded_count'] == 1
    assert calls == [('mail_messages_batch_update', args)]


@pytest.mark.parametrize('changed', ['requested_count', 'succeeded_count', 'failed_count', 'complete', 'refs'])
def test_batch_cannot_report_false_success_or_a_different_target_set(changed):
    args = {'account': 'reception', 'message_refs': ['selected-ref-1'], 'action': 'mark_read'}
    data = {'account': 'reception', 'action': 'mark_read', 'requested_count': 1, 'succeeded_count': 1, 'failed_count': 0, 'complete': True,
            'results': [{'message_ref': 'selected-ref-1', 'account': 'reception', 'folder': 'INBOX', 'is_read': True, 'status': 'updated', 'ok': True}]}
    if changed == 'refs':
        data['results'][0]['message_ref'] = 'other-ref'
    elif changed == 'complete':
        data['complete'] = False
    else:
        data[changed] += 1
    with pytest.raises(MailQueryError):
        validate_result_scope('mail_messages_batch_update', args, data)


def test_account_wide_result_cannot_silently_be_folder_scoped():
    with pytest.raises(MailQueryError, match='RESULT_SCOPE_MISMATCH'):
        validate_result_scope('mail_messages_count', {'account': 'reception'}, count_result())
