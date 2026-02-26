import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import Request
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware

from app.db.models import AuditTrail
from app.db.session import SessionLocal
from app.security.rbac import parse_identity, role_for_audit

logger = logging.getLogger("kajovo.api")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        context = getattr(record, "context", None)
        if isinstance(context, dict):
            payload.update(context)
        return json.dumps(payload, ensure_ascii=False)


_LOGGING_CONFIGURED = False


def configure_logging() -> None:
    global _LOGGING_CONFIGURED
    if _LOGGING_CONFIGURED:
        return

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(logging.INFO)

    _LOGGING_CONFIGURED = True


def _module_from_path(path: str) -> str:
    if path.startswith("/api/v1/"):
        segments = path.split("/")
        if len(segments) > 3:
            return segments[3]
    return "system"


def _should_audit(request: Request, status_code: int) -> bool:
    return (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and request.url.path.startswith("/api/v1/")
        and status_code < 500
    )


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        start = time.perf_counter()
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        module = _module_from_path(request.url.path)
        actor_id, actor_name, actor_role = parse_identity(request)
        actor_role_audit = role_for_audit(actor_role)
        request.state.request_id = request_id
        request.state.actor = actor_name
        request.state.actor_id = actor_id
        request.state.actor_role = actor_role

        request_body: str | None = None
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            body_bytes = await request.body()
            if body_bytes:
                raw_body = body_bytes.decode("utf-8", errors="ignore")
                try:
                    parsed = json.loads(raw_body)
                    if isinstance(parsed, dict) and "password" in parsed:
                        parsed = {**parsed, "password": "***"}
                    request_body = json.dumps(parsed, ensure_ascii=False)[:2000]
                except json.JSONDecodeError:
                    request_body = raw_body[:2000]

        response = await call_next(request)
        latency_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers["x-request-id"] = request_id

        log_context = {
            "request_id": request_id,
            "user": actor_name,
            "user_id": actor_id,
            "role": actor_role_audit,
            "module": module,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "latency_ms": latency_ms,
        }
        logger.info("request.completed", extra={"context": log_context})

        if _should_audit(request, response.status_code):
            db = SessionLocal()
            try:
                db.add(
                    AuditTrail(
                        request_id=request_id,
                        actor=actor_name,
                        actor_id=actor_id,
                        actor_role=actor_role_audit,
                        module=module,
                        action=request.method,
                        resource=request.url.path,
                        status_code=response.status_code,
                        detail=getattr(request.state, "audit_detail_override", request_body),
                    )
                )
                db.commit()
            except SQLAlchemyError:
                db.rollback()
                logger.exception(
                    "audit.write_failed",
                    extra={"context": {"request_id": request_id, "module": module}},
                )
            finally:
                db.close()

        return response
