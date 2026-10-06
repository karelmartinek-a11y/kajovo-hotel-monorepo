"""Infrastructure and current authorization injected by a host, per application context."""
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Any

@dataclass(frozen=True)
class RuntimePorts:
    session_factory: Callable
    settings: Any
    identity: Callable[[str], dict | None]
    request_identity: Callable | None = None
    application: Any = None
    provider_http: Callable | None = None
    provider_socket: Callable | None = None
    ha_connector: Callable | None = None

_current: ContextVar[RuntimePorts] = ContextVar('dagmar_runtime_ports')

@contextmanager
def bind(ports: RuntimePorts):
    token = _current.set(ports)
    try:
        yield ports
    finally:
        _current.reset(token)

def runtime():
    return _current.get()

def SessionLocal():
    return runtime().session_factory()

def get_settings():
    return runtime().settings

def current_identity(owner):
    value = runtime().identity(owner)
    if not value or not value.get('voice_authorized') or not value.get('namespace'):
        return None
    return value

def authorized(owner):
    return current_identity(owner) is not None

def utc_now():
    return datetime.now(timezone.utc)

def _as_utc(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def require_session(request, db=None):
    value = runtime().request_identity(request)
    if not value:
        from fastapi import HTTPException
        raise HTTPException(401, detail={"code": "unauthorized"})
    if not value.get("voice_authorized"):
        from fastapi import HTTPException
        raise HTTPException(403, detail={"code": "unauthorized"})
    return value


def get_db():
    with SessionLocal() as db:
        yield db


class ManagerPort:
    def __getattr__(self, name):
        return getattr(runtime().application.manager, name)

manager = ManagerPort()
