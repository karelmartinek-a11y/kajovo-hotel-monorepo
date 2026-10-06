"""Validate Mail MCP v2 scopes; completeness is owned by the requested MCP scope."""
from __future__ import annotations

class MailQueryError(ValueError):
    """Fixed diagnostic codes only."""


def _same_folder(left, right):
    return isinstance(left, str) and isinstance(right, str) and (left == right or left.upper() == right.upper() == "INBOX")


def validate_result_scope(name, args, value):
    if name in {"mail_messages_search", "mail_messages_unread", "mail_messages_count"}:
        scope = args["account"]
        if value.get("account") != scope:
            raise MailQueryError("RESULT_SCOPE_MISMATCH")
        if "folder" not in args and "folder_role" not in args and (value.get("resolved_folder") is not None or value.get("resolved_folder_role") is not None):
            raise MailQueryError("RESULT_SCOPE_MISMATCH")
        resolved = value.get("resolved_folders", [])
        if "folder_role" in args:
            if value.get("resolved_folder_role") != args["folder_role"]:
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
            expected = {"reception", "operations"} if scope == "all" else {scope}
            if {f.get("account") for f in resolved} != expected or len(resolved) != len(expected):
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
            if any(f.get("role") != args["folder_role"] for f in resolved):
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
        if "folder" in args and not _same_folder(args["folder"], value.get("resolved_folder")):
            raise MailQueryError("RESULT_SCOPE_MISMATCH")
        if scope != "all" and ("folder" in args or "folder_role" in args):
            if len(resolved) != 1 or resolved[0].get("account") != scope or not _same_folder(resolved[0].get("path"), value.get("resolved_folder")):
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
        for item in value.get("items", []):
            if scope != "all" and item.get("account") != scope:
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
            if "folder" in args or "folder_role" in args:
                paths = [f.get("path") for f in resolved if f.get("account") == item.get("account")]
                if len(paths) != 1 or not _same_folder(paths[0], item.get("folder")):
                    raise MailQueryError("RESULT_SCOPE_MISMATCH")
            if args.get("message_ref") and item.get("message_ref") != args["message_ref"]:
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
            for flag in ("is_read", "has_attachments"):
                if flag in args and item.get(flag) != args[flag]:
                    raise MailQueryError("RESULT_SCOPE_MISMATCH")
            if name == "mail_messages_unread" and item.get("is_read") is not False:
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
    elif name in {"mail_message_get_body", "mail_message_get_metadata", "mail_message_mark_read", "mail_message_mark_unread", "mail_message_move", "mail_message_trash"}:
        actual = value.get("message", value)
        if actual.get("message_ref") != args.get("message_ref") or actual.get("account") != args.get("account"):
            raise MailQueryError("RESULT_SCOPE_MISMATCH")
        if name == "mail_message_get_metadata" and "folder" in args and not _same_folder(args["folder"], actual.get("folder")):
            raise MailQueryError("RESULT_SCOPE_MISMATCH")
    elif name == "mail_thread_get":
        for item in value.get("items", []):
            if item.get("account") != args.get("account"):
                raise MailQueryError("RESULT_SCOPE_MISMATCH")
    elif name == "mail_messages_batch_update":
        results = value.get("results", [])
        if value.get("account") != args["account"] or value.get("action") != args["action"]:
            raise MailQueryError("RESULT_SCOPE_MISMATCH")
        if len(results) != len(args["message_refs"]) or {r.get("message_ref") for r in results} != set(args["message_refs"]):
            raise MailQueryError("RESULT_SCOPE_MISMATCH")
        succeeded = sum(r.get("ok") is True for r in results)
        failed = len(results) - succeeded
        if (value.get("requested_count") != len(results) or value.get("succeeded_count") != succeeded
                or value.get("failed_count") != failed or value.get("complete") != (failed == 0)):
            raise MailQueryError("CONTRACT_MISMATCH")
        for item in results:
            if item.get("ok") is True:
                if item.get("account") != args["account"]:
                    raise MailQueryError("RESULT_SCOPE_MISMATCH")
                if args["action"] == "move" and item.get("folder") != args["destination_folder"]:
                    raise MailQueryError("RESULT_SCOPE_MISMATCH")
                if args["action"] in {"mark_read", "mark_unread"} and item.get("is_read") != (args["action"] == "mark_read"):
                    raise MailQueryError("RESULT_SCOPE_MISMATCH")
    elif name == "mail_draft_get" and value.get("draft_ref") != args.get("draft_ref"):
        raise MailQueryError("RESULT_SCOPE_MISMATCH")


def _account_snapshot(states: list[dict], scope: str) -> tuple[tuple[str, str], ...] | None:
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
