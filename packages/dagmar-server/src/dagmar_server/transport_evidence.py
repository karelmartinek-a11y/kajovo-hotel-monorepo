"""Actual HTTP emission evidence; reservations and SDK admission are not dispatch."""
import contextvars
import json
import httpx

dispatch_evidence = contextvars.ContextVar('smartplan_dispatch_evidence', default=None)


class WireAttempt:
    def __init__(self, before=None, sent=None):
        self.before = before
        self.sent = sent
        self.entered = False
        self.cancelled = False
        self.failure = None
        self.origin = None
        self.identifiers = {}

    def dispatch(self):
        if self.cancelled:
            from .smart import SmartError
            raise SmartError('cancelled_not_sent')
        if self.before:
            self.before()
        if not self.entered:
            if self.sent:
                self.sent()
            # Set before awaiting network IO: an interrupted send may have effects.
            self.entered = True


class EvidenceHTTPClient(httpx.AsyncClient):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.dispatches = {}
        self.failure_code = None
        self.on_auth_failure = None

    async def send(self, request, **kwargs):
        binding = None
        if request.method == 'POST':
            try:
                body = json.loads(request.content)
            except (ValueError, httpx.RequestNotRead):
                body = {}
            if body.get('method') == 'tools/call':
                binding = self.dispatches.pop(body.get('id'), None)
                if binding is None:
                    # Its cancelled waiter may already have removed the binding.
                    # Never emit an unregistered RPC and never close the reader.
                    return self.local_cancel(request, body)
            elif request.url.path.endswith('/host/confirm'):
                binding = dispatch_evidence.get()
        if binding:
            try:
                binding.dispatch()
            except Exception as exc:
                from .smart import SmartError
                if not isinstance(exc, SmartError):
                    raise
                if body.get('method') != 'tools/call':
                    raise
                binding.failure = exc
                if binding.origin is not None:
                    binding.origin.failure = exc
                # Drop only this unsent RPC. Returning an internal protocol error
                # to its waiter keeps the SDK's shared HTTP owner/reader alive.
                # The client raises the original local guard error before any
                # result can become model-visible; this is no upstream success.
                return self.local_cancel(request, body)
        response = await super().send(request, **kwargs)
        if response.status_code in (401,403):
            self.failure_code = 'smartplan_access_denied'
            if self.on_auth_failure:
                self.on_auth_failure()
        return response

    @staticmethod
    def local_cancel(request, body):
        value = {'error':{'code':'cancelled_not_sent'}}
        return httpx.Response(200, request=request, json={
            'jsonrpc':'2.0','id':body['id'],'result':{
                'isError':True,'structuredContent':value,
                'content':[{'type':'text','text':json.dumps(value)}]}})
