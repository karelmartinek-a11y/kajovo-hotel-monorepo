"""Durable, locally authorized web receipts; no replay of uncertain effects."""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from datetime import timezone

from sqlalchemy import and_, or_, select

from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.db.models import CmlWebRequest


class ReceiptFault(Exception):
    def __init__(self, code: str, status: int):
        self.code, self.status = code, status
        super().__init__(code)


def request_id(value: str | None) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", value):
        raise ReceiptFault("WEB_REQUEST_ID_INVALID", 400)
    return value


def mutation_permission(suffix: str) -> str | None:
    parts = suffix.split("/")
    if len(parts) < 3 or parts[:2] != ["api", "v1"]:
        return None
    module = {
        "reports": "reports",
        "issues": "issues",
        "inventory": "inventory",
        "lost-found": "lost_found",
        "breakfast": "breakfast",
        "housekeeping": "housekeeping",
    }.get(parts[2])
    # Voice has its original lifetime and journals. Account changes remain
    # central; their credentials must never enter a generic response receipt.
    return module + ":write" if module else None


def authorize(identity, permission):
    if permission not in identity["public"].get("permissions", []):
        raise ReceiptFault("WEB_REQUEST_PERMISSION_DENIED", 403)


def owner_key(claims):
    return claims["sub"] + ":" + (claims["nativeId"] or "owner")


class WebRequests:
    def __init__(self, factory):
        self.factory = factory

    def read(self, owner, ident, identity):
        try:
            with self.factory() as db:
                row = db.get(CmlWebRequest, (owner, ident))
                if row is None:
                    return {"request_id": ident, "state": "not_found", "may_retry": False}
                authorize(identity, row.permission)
                return self.result(row)
        except SQLAlchemyError as exc:
            raise ReceiptFault("WEB_REQUEST_STORAGE_UNAVAILABLE", 503) from exc

    def personal_activity(self, owner, identity, cursor):
        public = identity["public"]
        permissions = public.get("available_permissions", public.get("permissions", []))
        table = CmlWebRequest
        query = select(
            table.request_id, table.permission, table.state, table.response_status, table.created_at
        ).where(table.owner == owner, table.permission.in_(permissions))
        try:
            with self.factory() as db:
                if cursor:
                    row = db.get(table, (owner, request_id(cursor)))
                    if row is None or row.permission not in permissions:
                        raise ReceiptFault("WEB_REQUEST_ID_INVALID", 400)
                    query = query.where(or_(
                        table.created_at < row.created_at,
                        and_(table.created_at == row.created_at, table.request_id < row.request_id),
                    ))
                rows = db.execute(query.order_by(table.created_at.desc(), table.request_id.desc()).limit(101)).all()
        except SQLAlchemyError as exc:
            raise ReceiptFault("WEB_REQUEST_STORAGE_UNAVAILABLE", 503) from exc

        items = []
        for ident, permission, state, status, at in rows[:100]:
            if state == "completed":
                if status == 202:
                    state = "accepted"
                elif status == 206 or status == 207:
                    state = "partial"
                elif status is not None and 200 <= status < 300:
                    state = "completed"
                elif status is not None and 400 <= status < 500:
                    state = "rejected"
                else:
                    state = "uncertain"
            if state == "pending":
                state = "uncertain"
            items.append({
                "seq": hashlib.sha256(ident.encode()).hexdigest(),
                "at": at.replace(tzinfo=at.tzinfo or timezone.utc).isoformat(),
                "action": permission,
                "status": state,
            })
        return {"items": items, "next": rows[99].request_id if len(rows) > 100 else None}

    @staticmethod
    def result(row):
        result = {"request_id": row.request_id, "state": row.state, "may_retry": False}
        if row.state == "completed":
            result.update(status=row.response_status, body=json.loads(row.response_json))
        return result

    def admit(self, owner, ident, identity, method, path, body, permission):
        authorize(identity, permission)
        fingerprint = hashlib.sha256(
            method.encode() + b"\0" + path.encode() + b"\0" + body
        ).hexdigest()
        try:
            with self.factory() as db:
                row = CmlWebRequest(
                    owner=owner,
                    request_id=ident,
                    fingerprint=fingerprint,
                    permission=permission,
                    state="pending",
                )
                db.add(row)
                try:
                    db.commit()
                    return None
                except IntegrityError:
                    db.rollback()
                row = db.get(CmlWebRequest, (owner, ident))
                if row is None:
                    raise ReceiptFault("WEB_REQUEST_STORAGE_UNAVAILABLE", 503)
                authorize(identity, row.permission)
                if row.fingerprint != fingerprint or row.permission != permission:
                    raise ReceiptFault("WEB_REQUEST_CONFLICT", 409)
                return self.result(row)
        except SQLAlchemyError as exc:
            raise ReceiptFault("WEB_REQUEST_STORAGE_UNAVAILABLE", 503) from exc

    def finish(self, owner, ident, status, body):
        try:
            with self.factory() as db:
                row = db.get(CmlWebRequest, (owner, ident), with_for_update=True)
                if row is None or row.state != "pending":
                    raise ReceiptFault("WEB_REQUEST_UNCERTAIN", 503)
                row.response_status = status
                row.response_json = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
                row.state = "completed"
                db.commit()
        except SQLAlchemyError as exc:
            raise ReceiptFault("WEB_REQUEST_UNCERTAIN", 503) from exc

    def uncertain(self, owner, ident):
        try:
            with self.factory() as db:
                row = db.get(CmlWebRequest, (owner, ident), with_for_update=True)
                if row is not None and row.state == "pending":
                    row.state = "uncertain"
                    db.commit()
        except SQLAlchemyError:
            # The original reservation still prevents dispatch. A GET can show
            # pending until storage is available; it must never resend instead.
            pass

    async def dispatch(self, owner, ident, app, scope, receive, send):
        status, content_type, chunks = 0, "", []
        size = 0

        async def capture(message):
            nonlocal status, content_type, size
            if message["type"] == "http.response.start":
                status = message["status"]
                content_type = (
                    dict(message.get("headers", [])).get(b"content-type", b"").decode("latin1")
                )
            elif message["type"] == "http.response.body":
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > 2_000_000:
                    raise ReceiptFault("WEB_REQUEST_UNCERTAIN", 503)
                chunks.append(chunk)

        try:
            await app(scope, receive, capture)
            raw = b"".join(chunks)
            if status == 204 and not raw:
                body = None
            elif content_type.split(";")[0] == "application/json" and 200 <= status <= 599:
                body = json.loads(raw)
            else:
                raise ReceiptFault("WEB_REQUEST_UNCERTAIN", 503)
            # Store the original response before acknowledging it to the browser.
            await asyncio.to_thread(self.finish, owner, ident, status, body)
        except Exception:
            await asyncio.to_thread(self.uncertain, owner, ident)
            raise ReceiptFault("WEB_REQUEST_UNCERTAIN", 503) from None
        from starlette.responses import JSONResponse, Response

        response = (
            Response(status_code=204) if status == 204 else JSONResponse(body, status_code=status)
        )
        response.headers["Cache-Control"] = "no-store"
        await response(scope, receive, send)
