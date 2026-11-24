"""Hotel MCP operations use the established, actor-bound CML request journal."""

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.db.models import PortalUser
from app.security.cml_requests import ReceiptFault, WebRequests
from app.security.hotel_oauth import ORIGIN, check_active_scope
from app.security.rbac import parse_identity


class OperationOut(BaseModel):
    operation_id: str
    state: Literal["completed", "rejected", "uncertain", "not_found"]
    http_status: int | None = None
    record_id: int | None = None
    photo_id: int | None = None
    updated_at: datetime | None = None
    code: str | None = None
    message: str | None = None


@dataclass(frozen=True)
class Actor:
    key: str
    permissions: frozenset[str]
    session: dict[str, Any]
    oauth_digest: str | None = None

    def identity(self) -> dict[str, Any]:
        return {"public": {"permissions": sorted(self.permissions)}}

    def request(self, method: str, path: str, operation_id: str) -> Request:
        pathname, _, query = path.partition("?")
        request = Request(
            {
                "type": "http",
                "scheme": "https",
                "server": (ORIGIN.removeprefix("https://"), 443),
                "method": method,
                "path": pathname,
                "headers": [],
                "query_string": query.encode(),
                "state": {
                    "_kajovo_auth_session": self.session,
                    "request_id": operation_id,
                },
            }
        )
        request.state.actor_id, _, request.state.actor_role = parse_identity(request)
        return request


def require_current(db: Session, actor: Actor, permission: str | None = None) -> None:
    if permission is not None and permission not in actor.permissions:
        raise HTTPException(403, "hotel_scope_denied")
    if actor.oauth_digest is not None and not check_active_scope(
        db, actor.oauth_digest, permission
    ):
        raise HTTPException(403, "hotel_scope_denied")
    native = actor.session.get("portal_user_id")
    if native is not None:
        user = db.get(PortalUser, native, populate_existing=True)
        if user is None or not user.is_active:
            raise HTTPException(403, "hotel_scope_denied")


def _receipt(previous: dict[str, Any]) -> OperationOut:
    operation_id = previous["request_id"]
    if previous["state"] == "not_found":
        return OperationOut(operation_id=operation_id, state="not_found")
    status = previous.get("status")
    if previous["state"] != "completed" or not isinstance(status, int) or status >= 500:
        return OperationOut(operation_id=operation_id, state="uncertain")
    value = previous.get("body")
    body = value if isinstance(value, dict) else {}
    return OperationOut(
        operation_id=operation_id,
        state="completed" if 200 <= status < 300 else "rejected",
        http_status=status,
        record_id=body.get("record_id", body.get("id")),
        photo_id=body.get("photo_id"),
        updated_at=body.get("updated_at"),
        code=body.get("code"),
        message=body.get("message"),
    )


def lookup(
    db: Session,
    journal: WebRequests,
    actor: Actor,
    operation_id: str,
) -> OperationOut:
    require_current(db, actor)
    if not any(permission.endswith(":write") for permission in actor.permissions):
        raise HTTPException(403, "hotel_scope_denied")
    return _receipt(journal.read(actor.key, operation_id, actor.identity()))


def execute(
    db: Session,
    journal: WebRequests,
    actor: Actor,
    *,
    operation_id: str,
    tool: str,
    permission: str,
    method: str,
    path: str,
    arguments: dict[str, Any],
    change: Callable[[Request, Session], dict[str, Any]],
    success_status: int,
) -> OperationOut:
    require_current(db, actor, permission)
    encoded = json.dumps(
        arguments, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode()
    previous = journal.admit(
        actor.key,
        operation_id,
        actor.identity(),
        method,
        "/mcp/" + tool,
        encoded,
        permission,
    )
    if previous is not None:
        return _receipt(previous)
    try:
        require_current(db, actor, permission)
        body = change(actor.request(method, path, operation_id), db)
        journal.finish(actor.key, operation_id, success_status, body)
    except HTTPException as error:
        db.rollback()
        if error.status_code >= 500:
            journal.uncertain(actor.key, operation_id)
            return OperationOut(operation_id=operation_id, state="uncertain")
        message = error.detail[:240] if isinstance(error.detail, str) else None
        failure = {"code": "hotel_action_rejected", "message": message}
        try:
            journal.finish(actor.key, operation_id, error.status_code, failure)
        except ReceiptFault:
            journal.uncertain(actor.key, operation_id)
            return OperationOut(operation_id=operation_id, state="uncertain")
        return OperationOut(
            operation_id=operation_id,
            state="rejected",
            http_status=error.status_code,
            code="hotel_action_rejected",
            message=message,
        )
    except Exception:
        # A native route may have committed before its receipt could be saved.
        db.rollback()
        journal.uncertain(actor.key, operation_id)
        return OperationOut(operation_id=operation_id, state="uncertain")
    return _receipt(journal.read(actor.key, operation_id, actor.identity()))
