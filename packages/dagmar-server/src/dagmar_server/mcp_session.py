"""Per-request cancellation for the explicitly pinned MCP 1.30.0 / 2025 SDK.

That SDK increments _request_id synchronously before its first await but does not
emit notifications/cancelled when a client waiter is cancelled. This adapter is
intentionally pinned and tested against actual wire request IDs. It never closes
shared readers and never interprets speech cancellation as a server-run cancel.
"""
import asyncio
import json
from importlib.metadata import version

import anyio
from mcp import ClientSession
from mcp.types import ClientNotification, CancelledNotification, CancelledNotificationParams

SUPPORTED_PROTOCOLS = {'2025-03-26','2025-06-18','2025-11-25'}


class ContractOutputMismatch(RuntimeError):
    """Content-free failure with only bounded original recovery identifiers."""
    def __init__(self,name,value):
        super().__init__('invalid_contract_output')
        self.tool = name
        self.proposal_id = value.get('proposal_id') if isinstance(value,dict) and isinstance(value.get('proposal_id'),str) and len(value['proposal_id'])<=512 else None


class ScopedClientSession(ClientSession):
    async def initialize(self):
        if version('mcp') != '1.30.0':
            raise RuntimeError('unsupported_scoped_cancellation_sdk')
        result = await super().initialize()
        self.negotiated_protocol = result.protocolVersion
        return result

    async def _validate_tool_result(self,name,result):
        # MCP 1.30.0's implementation calls jsonschema.validate, which checks the
        # entire metaschema on every successful result. Retain full validation
        # against the authenticated, already checked canonical schema instead.
        contract = getattr(self,'public_contract',None)
        if contract is None:
            raise RuntimeError('public_contract_required_before_tool_call')
        if name not in contract.tools:
            raise RuntimeError('unlisted_contract_tool')
        if name in contract.outputs:
            if result.structuredContent is None:
                texts = [part.text for part in result.content if part.type == 'text']
                try:
                    recovery = json.loads(texts[0]) if len(texts)==1 else {}
                except (ValueError,TypeError):
                    recovery = {}
                raise ContractOutputMismatch(name,recovery)
            try:
                await asyncio.to_thread(contract.validate_output,name,result.structuredContent)
            except ValueError:
                raise ContractOutputMismatch(name,result.structuredContent) from None

    async def send_request(self, request, result_type, *args, **kwargs):
        request_id = self._request_id
        method = getattr(getattr(request, 'root', None), 'method', None)
        try:
            return await super().send_request(request, result_type, *args, **kwargs)
        except asyncio.CancelledError:
            if method != 'initialize' and getattr(self, 'negotiated_protocol', None) in SUPPORTED_PROTOCOLS:
                # Bounded evidence transport; no credentials, payload or target names.
                with anyio.move_on_after(1, shield=True):
                    try:
                        await self.send_notification(ClientNotification(CancelledNotification(
                            params=CancelledNotificationParams(requestId=request_id, reason='foreground_superseded'))))
                    except Exception:
                        pass
            raise
