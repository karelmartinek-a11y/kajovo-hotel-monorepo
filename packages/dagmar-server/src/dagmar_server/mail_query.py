"""Read-only, bounded mail query completion; no provider or mailbox mutations."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Mapping
from typing import Literal, TypedDict, cast

Account = Literal["reception", "operations"]
Scope = Literal["reception", "operations", "all"]
CountReason = Literal["INDEX_INCOMPLETE", "INDEX_CHANGED", "PAGE_LIMIT", "TIME_LIMIT"] | None


class AccountState(TypedDict):
    account: Account
    last_sync_at: str | None
    index_complete: bool
    available: bool


class CountResult(TypedDict):
    result_mode: Literal["count"]
    account: Scope
    folder: str | None
    count: int | None
    complete: bool
    basis: Literal["synchronized_index"]
    reason: CountReason
    accounts: list[AccountState]


class MailQueryError(ValueError):
    """Only fixed diagnostic codes, never mailbox content."""


def _same_folder(left: object, right: object) -> bool:
    if not isinstance(left, str) or not isinstance(right, str):
        return False
    return left == right or left.upper() == right.upper() == "INBOX"


def validate_result_scope(name: str, args: Mapping[str, object], value: Mapping[str, object]) -> None:
    """Reject a schema-valid answer for a different account, folder or read identity."""
    if name in {"mail_messages_search", "mail_messages_unread"}:
        scope = args.get("account", "all")
        for item in cast(list[Mapping[str, object]], value.get("items", [])):
            if scope != "all" and item.get("account") != scope:
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
            if "folder" in args and not _same_folder(args["folder"], item.get("folder")):
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
            if args.get("message_ref") and item.get("message_ref") != args["message_ref"]:
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
            for flag in ("is_read", "has_attachments"):
                if flag in args and item.get(flag) != args[flag]:
                    raise MailQueryError("RESULT_SCOPE_MISMATCH")
            if name == "mail_messages_unread" and item.get("is_read") is not False:
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
    elif name == "mail_message_get_body":
        if value.get("message_ref") != args.get("message_ref"):
            raise MailQueryError("RESULT_SCOPE_MISMATCH")
    elif name == "mail_message_get_metadata":
        message = value.get("message")
        if not isinstance(message, Mapping) or message.get("message_ref") != args.get("message_ref"):
            raise MailQueryError("RESULT_SCOPE_MISMATCH")
    elif name == "mail_draft_get":
        if value.get("draft_ref") != args.get("draft_ref"):
            raise MailQueryError("RESULT_SCOPE_MISMATCH")


def _account_snapshot(states: list[AccountState], scope: Scope) -> tuple[tuple[str, str], ...] | None:
    expected = {"reception", "operations"} if scope == "all" else {scope}
    observed: dict[str, str] = {}
    for state in states:
        account = state["account"]
        # A scoped query must not derive completeness from an unrelated healthy account.
        if account not in expected or account in observed:
            return None
        stamp = state["last_sync_at"]
        if not state["available"] or not state["index_complete"] or not stamp:
            return None
        observed[account] = stamp
    return tuple(sorted(observed.items())) if set(observed) == expected else None


async def count_messages(
    fetch: Callable[[dict[str, object]], Awaitable[dict[str, object]]],
    filters: Mapping[str, object],
    *,
    max_pages: int = 1000,
    timeout: float = 45.0,
) -> CountResult:
    """Count a complete, unchanged indexed result, not the first page of previews.

    Each page retains exactly the same filters. Partial, unavailable or changing
    indexes never produce a numeric count, including zero. The mailbox protocol
    currently exposes an index, not an atomic live IMAP COUNT; the basis is
    reported explicitly. Cancellation propagates and only reads are performed.
    """
    if filters.get("account") not in {"reception", "operations", "all"}:
        raise MailQueryError("ACCOUNT_REQUIRED")
    if any(key in filters for key in ("cursor", "limit", "result_mode")):
        raise MailQueryError("INVALID_COUNT_QUERY")
    if max_pages < 1 or timeout <= 0:
        raise MailQueryError("INVALID_COUNT_QUERY")
    scope = cast(Scope, filters["account"])
    query = dict(filters)
    query["limit"] = 100
    query["sort"] = "date"
    refs: set[tuple[str, str]] = set()
    cursors: set[str] = set()
    snapshot: tuple[tuple[str, str], ...] | None = None
    accounts: list[AccountState] = []
    deadline = time.monotonic() + timeout

    def result(reason: CountReason = None) -> CountResult:
        return {
            "result_mode": "count", "account": scope,
            "folder": cast(str | None, filters.get("folder")),
            "count": len(refs) if reason is None else None,
            "complete": reason is None, "basis": "synchronized_index",
            "reason": reason, "accounts": accounts,
        }

    for _ in range(max_pages):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return result("TIME_LIMIT")
        try:
            page = await asyncio.wait_for(fetch(dict(query)), timeout=remaining)
        except TimeoutError:
            return result("TIME_LIMIT")
        validate_result_scope("mail_messages_search", query, page)
        accounts = cast(list[AccountState], page["accounts"])
        current = _account_snapshot(accounts, scope)
        if current is None:
            return result("INDEX_INCOMPLETE")
        if snapshot is None:
            snapshot = current
        elif snapshot != current:
            return result("INDEX_CHANGED")
        for item in cast(list[dict[str, object]], page["items"]):
            identity = (cast(str, item["account"]), cast(str, item["message_ref"]))
            if identity in refs:
                # An overlapping/changing page cannot certify a total.
                return result("INDEX_CHANGED")
            refs.add(identity)
        cursor = page["next_cursor"]
        if cursor is None:
            return result(None if page["complete"] is True else "INDEX_INCOMPLETE")
        if not isinstance(cursor, str) or not cursor or cursor in cursors:
            raise MailQueryError("INVALID_CURSOR")
        cursors.add(cursor)
        query["cursor"] = cursor
    return result("PAGE_LIMIT")


# Host-only output; the remote mail-mcp/1 catalog remains byte-for-byte unchanged.
COUNT_SCHEMA = {
    "type": "object",
    "properties": {
        "result_mode": {"type": "string", "const": "count"},
        "account": {"type": "string", "enum": ["reception", "operations", "all"]},
        "folder": {"type": ["string", "null"]},
        "count": {"type": ["integer", "null"], "minimum": 0},
        "complete": {"type": "boolean"},
        "basis": {"type": "string", "const": "synchronized_index"},
        "reason": {"type": ["string", "null"], "enum": [None, "INDEX_INCOMPLETE", "INDEX_CHANGED", "PAGE_LIMIT", "TIME_LIMIT"]},
        "accounts": {"type": "array", "items": {
            "type": "object", "properties": {
                "account": {"type": "string", "enum": ["reception", "operations"]},
                "last_sync_at": {"type": ["string", "null"]},
                "index_complete": {"type": "boolean"},
                "available": {"type": "boolean"},
            },
            "required": ["account", "last_sync_at", "index_complete", "available"],
            "additionalProperties": False,
        }},
    },
    "required": ["result_mode", "account", "folder", "count", "complete", "basis", "reason", "accounts"],
    "additionalProperties": False,
    "allOf": [{
        "if": {"properties": {"complete": {"const": True}}},
        "then": {"properties": {"count": {"type": "integer"}, "reason": {"type": "null"}}},
        "else": {"properties": {"count": {"type": "null"}, "reason": {"type": "string"}}},
    }],
}
