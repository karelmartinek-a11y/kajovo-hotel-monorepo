import json
import hashlib
import logging
import time
import uuid
import re
from collections import OrderedDict
from threading import Lock
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.concurrency import run_in_threadpool

from app.audit_utils import sanitize_for_audit
from app.db.models import AuditTrail
from app.db.session import SessionLocal
from app.security.rbac import parse_identity, role_for_audit
from app.time_utils import utc_now

logger = logging.getLogger("kajovo.api")

AUTH_AUDIT_PATHS = {
    '/api/auth/admin/login', '/api/auth/admin/logout', '/api/auth/admin/hint',
    '/api/auth/login', '/api/auth/logout', '/api/auth/request-password-reset',
    '/api/auth/change-password', '/api/auth/reset-password', '/api/auth/profile',
    '/api/auth/locale', '/api/auth/select-role',
}
BUSINESS_MODULES = {'breakfast', 'housekeeping', 'inventory', 'issues', 'lost-found', 'reports', 'users', 'settings', 'profile', 'chat', 'device'}
MEMORY_WRITES = {'memory_remember', 'memory_update', 'memory_forget', 'note_create', 'note_rename', 'note_archive', 'note_delete', 'note_clear', 'note_item_add', 'note_item_update', 'note_item_remove', 'note_item_move', 'note_text_update'}
PRIVATE_LOG_FIELDS = {'body', 'text', 'content', 'audio', 'transcript', 'prompt', 'sdp', 'arguments', 'result', 'results', 'request_body', 'text_body', 'html_body', 'messages'}


EXTERNAL_LOGGERS = ("mcp", "httpx", "httpcore", "websockets")


def external_logger(name):
    return any(name == prefix or name.startswith(prefix + '.') for prefix in EXTERNAL_LOGGERS)


def external_event(level):
    return 'external.transport.failed' if level >= logging.ERROR else 'external.transport.warning' if level >= logging.WARNING else 'external.transport.event'


class SafeTransportFilter(logging.Filter):
    """Drop SDK chatter and normalize failures before bounded repeat suppression."""
    def filter(self, record):
        if not external_logger(record.name):
            return True
        if record.levelno < logging.WARNING:
            return False
        record.msg, record.args = external_event(record.levelno), ()
        record.exc_info = record.exc_text = record.stack_info = None
        record.context = {}
        return True


class RepeatedErrorFilter(logging.Filter):
    """Bound repeated identical failures, never retain payloads or correlation IDs."""
    def __init__(self):
        super().__init__()
        self.seen = OrderedDict()
        self.lock = Lock()

    def filter(self, record):
        if record.levelno < logging.WARNING:
            return True
        context = getattr(record, 'context', {})
        key = (record.name, hashlib.sha256(str(record.msg).encode()).digest(), context.get('component'), context.get('code'))
        now = time.monotonic()
        with self.lock:
            prior, dropped = self.seen.pop(key, (0, 0))
            if prior and now - prior < 60:
                self.seen[key] = (prior, dropped + 1)
                return False
            self.seen[key] = (now, 0)
            while len(self.seen) > 256:
                self.seen.popitem(last=False)
        if dropped:
            record.context = {**context, 'suppressed_repeats': dropped}
        return True


def _log_value(value, depth=0):
    if depth > 3:
        return '[bounded]'
    if isinstance(value, dict):
        return {str(k)[:64]: _log_value(v, depth+1) for k, v in list(sanitize_for_audit(value).items())[:24] if str(k).lower() not in PRIVATE_LOG_FIELDS}
    if isinstance(value, (tuple, list)):
        return [_log_value(v, depth+1) for v in value[:16]]
    return value[:256] if isinstance(value, str) else value if isinstance(value, (int, float, bool, type(None))) else '[unsupported]'


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": utc_now().isoformat(),
            "level": record.levelname,
            "message": external_event(record.levelno) if external_logger(record.name) else record.getMessage()[:512],
            "component": record.name,
        }
        context = getattr(record, "context", None)
        if isinstance(context, dict) and not external_logger(record.name):
            payload.update(_log_value(context))
        if external_logger(record.name) and isinstance(context, dict) and isinstance(context.get('suppressed_repeats'), int):
            payload['suppressed_repeats'] = context['suppressed_repeats']
        encoded = json.dumps(payload, ensure_ascii=False)
        if len(encoded.encode()) > 4096:
            payload = {key: payload[key] for key in ('timestamp', 'level', 'message', 'component', 'request_id', 'code', 'retryable', 'suppressed_repeats') if key in payload}
            payload['context_bounded'] = True
            encoded = json.dumps(payload, ensure_ascii=False)
        return encoded


_LOGGING_CONFIGURED = False


def configure_logging() -> None:
    global _LOGGING_CONFIGURED
    if _LOGGING_CONFIGURED:
        return

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    handler.addFilter(SafeTransportFilter())
    handler.addFilter(RepeatedErrorFilter())

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.INFO)

    # HTTP access belongs to host Nginx; SDK success logs duplicate it and expose URLs.
    logging.getLogger('uvicorn.access').disabled = True
    for name in EXTERNAL_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
    for name in ('uvicorn.error', 'uvicorn'):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True
    _LOGGING_CONFIGURED = True


def _module_from_path(path: str) -> str:
    if path.startswith("/api/v1/"):
        segments = path.split("/")
        if len(segments) > 3:
            return segments[3]
    return "system"


def _audit_semantics(request: Request, payload: Any = None) -> bool:
    if request.method not in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        return False
    path = request.url.path
    if path in AUTH_AUDIT_PATHS:
        return True
    if path.startswith('/api/v1/admin/voice-core'):
        return path in {'/api/v1/admin/voice-core/config', '/api/v1/admin/voice-core/api-key'}
    if path.startswith('/api/v1/admin/voice-memory'):
        if path == '/api/v1/admin/voice-memory/settings':
            return request.method == 'PUT'
        operation = payload.get('request', {}).get('operation') if isinstance(payload, dict) and isinstance(payload.get('request'), dict) else None
        return path == '/api/v1/admin/voice-memory/operations' and operation in MEMORY_WRITES
    if path.startswith(('/api/v1/admin/profile', '/api/v1/admin/settings/')):
        return True
    return _module_from_path(path) in BUSINESS_MODULES


def _should_audit(request: Request, status_code: int, payload: Any = None) -> bool:
    return status_code < 500 and _audit_semantics(request, payload)


def _write_audit(values):
    # Session creation, commit/rollback and close all belong to this worker.
    with SessionLocal() as db:
        try:
            db.add(AuditTrail(**values))
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            logger.error('audit.write_failed', extra={'context': {'request_id': values['request_id'], 'component': 'audit', 'code': 'audit_write_failed'}})


def _audit_detail(request: Request, default: str | None) -> str | None:
    scoped = request.scope.get("audit_detail_override")
    if isinstance(scoped, str):
        return scoped
    return getattr(request.state, "audit_detail_override", default)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        start = time.perf_counter()
        request_id = request.headers.get("x-request-id", "")
        if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,128}", request_id):
            request_id = str(uuid.uuid4())
        module = _module_from_path(request.url.path)
        try:
            actor_id, actor_name, actor_role = await run_in_threadpool(parse_identity, request)
        except HTTPException:
            actor_id, actor_name, actor_role = "", "", "unauthenticated"
        actor_role_audit = role_for_audit(actor_role)
        request.state.request_id = request_id
        request.state.actor = actor_name
        request.state.actor_id = actor_id
        request.state.actor_role = actor_role

        request_body, parsed = None, None
        # Only semantic audit operations need a body; technical traffic is never copied.
        memory_operation = request.url.path == '/api/v1/admin/voice-memory/operations' and request.method == 'POST'
        if _audit_semantics(request) or memory_operation:
            body_bytes = await request.body()
            if body_bytes and len(body_bytes) <= 65536:
                try:
                    parsed = json.loads(body_bytes)
                except (ValueError, UnicodeDecodeError):
                    pass
            if parsed is not None and not request.url.path.startswith(('/api/v1/admin/voice-', '/api/v1/chat')):
                request_body = json.dumps(sanitize_for_audit(parsed), ensure_ascii=False)[:2000]

        try:
            response = await call_next(request)
        except Exception:
            logger.error('request.failed', extra={'context': {
                'request_id': request_id, 'component': module, 'code': 'unhandled_request',
                'latency_ms': round((time.perf_counter() - start) * 1000, 2),
            }})
            raise
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["x-request-id"] = request_id

        if response.status_code >= 500 or response.status_code in {401, 403, 429}:
            logger.warning('request.failed', extra={'context': {
                'request_id': request_id, 'component': module, 'code': 'http_' + str(response.status_code),
                'method': request.method, 'latency_ms': latency_ms,
            }})
        if _should_audit(request, response.status_code, parsed):
            detail = _audit_detail(request, request_body)
            if request.url.path.startswith('/api/v1/admin/voice-'):
                detail = None
            await run_in_threadpool(_write_audit, {
                'request_id': request_id, 'actor': actor_name, 'actor_id': actor_id,
                'actor_role': actor_role_audit, 'module': module, 'action': request.method,
                'resource': request.url.path, 'status_code': response.status_code, 'detail': detail,
            })
        return response
