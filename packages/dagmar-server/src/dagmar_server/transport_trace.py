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


def http_hooks():
    """Capture JSON-RPC and remote IDs on each HTTP request, without shared headers."""
    import json
    import time
    from uuid import uuid4
    callback = observer.get()
    async def request(value):
        local = uuid4().hex
        rpc = operation = None
        try:
            if len(value.content) <= 100000:
                body = json.loads(value.content)
                candidate = body.get('id')
                if isinstance(candidate, (str,int)) and len(str(candidate)) <= 128:
                    rpc = str(candidate)
                candidate = body.get('params', {}).get('arguments', {}).get('request_id')
                if isinstance(candidate,str) and len(candidate) <= 128:
                    operation = candidate
        except (ValueError, TypeError, AttributeError):
            pass
        value.extensions['dagmar_trace'] = (local,rpc,operation,time.monotonic())
        if callback:
            callback({'type':'mcp.http.start','request_id':local,'function_id':rpc,'operation_id':operation})
    async def response(value):
        trace = value.request.extensions.get('dagmar_trace')
        if callback and trace:
            local,rpc,operation,started = trace
            remote = value.headers.get('x-request-id')
            if remote and (len(remote)>128 or not all(c.isalnum() or c in '_-.' for c in remote)):
                remote = None
            callback({'type':'mcp.http.done','request_id':local,'function_id':rpc,'operation_id':operation,
                'remote_request_id':remote,'http_status':value.status_code,'duration_ms':(time.monotonic()-started)*1000})
    return {'request':[request], 'response':[response]}
