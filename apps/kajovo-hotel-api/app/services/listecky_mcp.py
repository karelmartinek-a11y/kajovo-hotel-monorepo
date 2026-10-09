"""Backend-only Lístečky transport. No provider/browser credential delegation."""
import json

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from dagmar_server.memory_contract import MemoryResult

MCP_URL = 'https://listecky.hcasc.cz/mcp'


class ListeckyMemory:
    def __init__(self, authorization, *, url=MCP_URL, http_factory=httpx.AsyncClient):
        self._authorization = authorization
        self._url = url
        self._http_factory = http_factory

    async def __call__(self, request, operation_id):
        # Production always uses the fixed public endpoint; test hosts inject loopback URLs.
        if not self._authorization.startswith('Bearer ') or any(c.isspace() for c in self._authorization[7:]) or not self._authorization[7:]:
            raise ValueError('memory_mcp_not_configured')
        async with self._http_factory(headers={'Authorization': self._authorization}, timeout=15, follow_redirects=False) as http:
            async with streamable_http_client(self._url, http_client=http) as (read, write, _):
                async with ClientSession(read, write) as client:
                    await client.initialize()
                    args = {'request': request.request.model_dump(mode='json')}
                    if operation_id:
                        args['operation_id'] = operation_id
                    response = await client.call_tool('assistant_memory', args)
                    if response.isError:
                        raise ValueError('memory_mcp_tool_error')
                    value = response.structuredContent
                    if value is None:
                        value = json.loads(''.join(part.text for part in response.content if part.type == 'text'))
                    if len(json.dumps(value)) > 1024 * 1024:
                        raise ValueError('memory_mcp_result_too_large')
                    return MemoryResult.model_validate(value)
