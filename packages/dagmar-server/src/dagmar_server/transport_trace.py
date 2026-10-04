"""Task-local per-request observation; never shared mutable session headers."""
from contextvars import ContextVar
from contextlib import contextmanager

observer = ContextVar("dagmar_mcp_observer", default=None)


@contextmanager
def observe(callback):
    token = observer.set(callback)
    try:
        yield
    finally:
        observer.reset(token)
