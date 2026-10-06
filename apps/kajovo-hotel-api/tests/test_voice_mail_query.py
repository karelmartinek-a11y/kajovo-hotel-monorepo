"""Offline mail pagination/scope regressions; never connect to real mailboxes."""
import asyncio
import copy

import pytest
from jsonschema import Draft202012Validator

from dagmar_server.mail_query import COUNT_SCHEMA, MailQueryError, count_messages, validate_result_scope


def state(account="reception", **changes):
    return {"account": account, "last_sync_at": "2026-10-06T01:00:00Z", "index_complete": True, "available": True, **changes}


def item(index, account="reception", folder="INBOX", **changes):
    return {"message_ref": f"mail-ref-{index:06d}", "account": account, "folder": folder,
            "is_read": False, "has_attachments": False, **changes}


def page(items=(), cursor=None, complete=True, accounts=None):
    return {"items": list(items), "next_cursor": cursor, "complete": complete,
            "accounts": accounts if accounts is not None else [state()]}


def count(pages, filters=None, **options):
    calls = []
    values = iter(pages)

    async def fetch(args):
        calls.append(copy.deepcopy(args))
        return copy.deepcopy(next(values))

    result = asyncio.run(count_messages(fetch, filters or {"account": "reception", "folder": "INBOX"}, **options))
    Draft202012Validator(COUNT_SCHEMA).validate(result)
    return result, calls


def test_count_traverses_every_page_and_keeps_scope_filters_and_cursor():
    filters = {"account": "reception", "folder": "INBOX", "from": "sender@example.invalid", "is_read": False}
    original = copy.deepcopy(filters)
    result, calls = count([
        page([item(i) for i in range(100)], "signed-page-2", complete=False),
        page([item(i) for i in range(100, 139)]),
    ], filters)
    assert result["count"] == 139 and result["complete"] is True
    assert result["basis"] == "synchronized_index"
    assert len(calls) == 2 and calls[1]["cursor"] == "signed-page-2"
    assert all(all(call[k] == v for k, v in filters.items()) for call in calls)
    assert all(call["limit"] == 100 and call["sort"] == "date" for call in calls)
    assert filters == original
    assert "items" not in result and "text_body" not in result


def test_empty_complete_result_is_zero():
    result, _ = count([page()])
    assert result["count"] == 0 and result["complete"] is True


@pytest.mark.parametrize("accounts", [
    [], [state(available=False)], [state(index_complete=False)], [state(last_sync_at=None)],
    [state(last_sync_at="")], [state("operations")], [state(), state()],
    [state(), state("operations")],
])
def test_incomplete_or_wrong_account_metadata_never_becomes_a_number(accounts):
    result, _ = count([page([item(1)], accounts=accounts)])
    assert result["count"] is None and result["reason"] == "INDEX_INCOMPLETE"
    assert result["complete"] is False


def test_all_accounts_requires_both_and_counts_distinct_message_identities():
    accounts = [state(), state("operations")]
    result, _ = count([page([item(1), item(1, "operations")], accounts=accounts)], {"account": "all"})
    assert result["count"] == 2 and result["folder"] is None
    result, _ = count([page([item(1)])], {"account": "all"})
    assert result["count"] is None


def test_changed_sync_watermark_invalidates_total():
    result, _ = count([page([item(1)], "next"), page([item(2)], accounts=[state(last_sync_at="2026-10-06T01:00:10Z")])])
    assert result["count"] is None and result["reason"] == "INDEX_CHANGED"


def test_duplicate_message_between_pages_cannot_certify_total():
    result, _ = count([page([item(1)], "next"), page([item(1)])])
    assert result["count"] is None and result["reason"] == "INDEX_CHANGED"


def test_terminal_incomplete_result_is_not_exact_even_with_healthy_accounts():
    result, _ = count([page([item(1)], complete=False)])
    assert result["count"] is None and result["reason"] == "INDEX_INCOMPLETE"


def test_page_limit_never_exposes_partial_number_as_count():
    result, calls = count([page([item(1)], "next")], max_pages=1)
    assert result["count"] is None and result["reason"] == "PAGE_LIMIT"
    assert len(calls) == 1


@pytest.mark.parametrize("filters", [
    {"folder": "INBOX"}, {"account": "unknown"}, {"account": "reception", "cursor": "old"},
    {"account": "reception", "limit": 1}, {"account": "reception", "result_mode": "count"},
])
def test_count_rejects_unscoped_or_already_paginated_requests(filters):
    with pytest.raises(MailQueryError):
        count([], filters)


def test_repeated_cursor_is_rejected_without_looping():
    with pytest.raises(MailQueryError, match="INVALID_CURSOR"):
        count([page([item(1)], "repeat"), page([item(2)], "repeat")])


def test_count_timeout_does_not_become_zero():
    async def fetch(args):
        await asyncio.sleep(0.1)
        return page()
    result = asyncio.run(count_messages(fetch, {"account": "reception"}, timeout=0.001))
    assert result["count"] is None and result["reason"] == "TIME_LIMIT"
    Draft202012Validator(COUNT_SCHEMA).validate(result)


def test_cancellation_is_propagated():
    async def fetch(args):
        raise asyncio.CancelledError()
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(count_messages(fetch, {"account": "reception"}))


def test_backend_failure_is_not_hidden_as_empty_success():
    async def fetch(args):
        raise RuntimeError("synthetic backend error")
    with pytest.raises(RuntimeError):
        asyncio.run(count_messages(fetch, {"account": "reception"}))


@pytest.mark.parametrize("args,bad_item", [
    ({"account": "reception"}, item(1, "operations")),
    ({"account": "reception", "folder": "INBOX"}, item(1, folder="Sent")),
    ({"account": "reception", "message_ref": "mail-ref-000002"}, item(1)),
    ({"account": "reception", "is_read": True}, item(1)),
    ({"account": "reception", "has_attachments": True}, item(1)),
])
def test_wrong_scope_is_rejected_before_returning_mail_data(args, bad_item):
    with pytest.raises(MailQueryError, match="RESULT_SCOPE_MISMATCH"):
        validate_result_scope("mail_messages_search", args, page([bad_item]))


def test_inbox_case_does_not_make_a_false_scope_error():
    validate_result_scope("mail_messages_search", {"account": "reception", "folder": "inbox"}, page([item(1)]))


def test_read_item_cannot_be_returned_as_unread():
    with pytest.raises(MailQueryError, match="RESULT_SCOPE_MISMATCH"):
        validate_result_scope("mail_messages_unread", {}, page([item(1, is_read=True)]))


@pytest.mark.parametrize("name,args,value", [
    ("mail_message_get_body", {"message_ref": "selected-ref"}, {"message_ref": "other-ref"}),
    ("mail_message_get_metadata", {"message_ref": "selected-ref"}, {"message": {"message_ref": "other-ref"}}),
    ("mail_draft_get", {"draft_ref": "selected-ref"}, {"draft_ref": "other-ref"}),
])
def test_read_identity_must_match_selected_reference(name, args, value):
    with pytest.raises(MailQueryError, match="RESULT_SCOPE_MISMATCH"):
        validate_result_scope(name, args, value)


def test_move_is_not_mistaken_for_read_identity_validation():
    validate_result_scope("mail_message_move", {"message_ref": "old-ref"}, {"message_ref": "new-ref", "folder": "Archive"})


def test_count_schema_rejects_false_success_and_false_zero():
    Draft202012Validator.check_schema(COUNT_SCHEMA)
    result, _ = count([page()])
    result["complete"] = False
    assert list(Draft202012Validator(COUNT_SCHEMA).iter_errors(result))
    result["count"] = None
    result["reason"] = "INDEX_INCOMPLETE"
    Draft202012Validator(COUNT_SCHEMA).validate(result)
    result["complete"] = True
    assert list(Draft202012Validator(COUNT_SCHEMA).iter_errors(result))
