"""Durable, locally authorized web receipts; no replay of uncertain effects."""

from __future__ import annotations

import asyncio
import hashlib
import json
import re

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
    if suffix in {'api/v1/admin/voice-core/config', 'api/v1/admin/voice-core/api-key',
                  'api/v1/admin/voice-memory/operations', 'api/v1/admin/voice-memory/settings'}:
        return 'voice:write'
    module = {
        "reports": "reports",
        "issues": "issues",
        "inventory": "inventory",
        "lost-found": "lost_found",
        "breakfast": "breakfast",
        "housekeeping": "housekeeping",
    }.get(parts[2])
    # Voice calls retain their own lifetime and journals; this receipt covers only
    # configuration and explicit memory management, never SDP or a provider call. Account changes remain
    # central; their credentials must never enter a generic response receipt.
    return module + ":write" if module else None


def authorize(identity, permission):
    if permission == 'voice:write':
        if identity['public'].get('admin') and identity['public'].get('active_role') == 'admin':
            return
        raise ReceiptFault("WEB_REQUEST_PERMISSION_DENIED", 403)
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
