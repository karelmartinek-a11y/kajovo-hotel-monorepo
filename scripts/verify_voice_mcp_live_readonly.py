"""Run inside the authorized API image. initialize/tools/list only; no tool calls."""
import asyncio
import hashlib
import json
import socket

import httpx
from app.config import get_settings
from dagmar_server.smart import mcp_connection, MCP_URL as HA_URL


async def verify():
    settings = get_settings()
    result = {'mutations': 0, 'tool_calls': 0}
    for name, url, connector in [
        ('ha', HA_URL, lambda: mcp_connection(settings.kajavoiceha_mcp_token)),
    ]:
        host = httpx.URL(url).host
        families = {value[0] for value in socket.getaddrinfo(host, 443)}
        async with asyncio.timeout(45):
            async with connector() as session:
                initialized = await session.initialize()
                tools = await session.list_tools()
                schemas = {tool.name: {'input': tool.inputSchema, 'output': tool.outputSchema} for tool in tools.tools}
                digest = hashlib.sha256(json.dumps(schemas, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
            async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
                denied = await client.post(url, headers={'Accept': 'application/json, text/event-stream'}, json={
                    'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
                        'protocolVersion': '2025-03-26', 'capabilities': {},
                        'clientInfo': {'name': 'readonly-release-check', 'version': '1'},
                    },
                })
                assert denied.status_code in {401, 403}
        result[name] = {'initialize': 'PASS', 'tools_list': 'PASS', 'tools': len(schemas),
            'schema_sha256': digest, 'unauthenticated_http_status': denied.status_code,
            'protocol': initialized.protocolVersion, 'ipv4': socket.AF_INET in families,
            'ipv6': socket.AF_INET6 in families, 'timeout_seconds': 45}
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try:
        asyncio.run(verify())
    except Exception:
        print(json.dumps({'verification': 'FAIL', 'code': 'mcp_contract_or_transport_failed', 'mutations': 0, 'tool_calls': 0}))
        raise SystemExit(1) from None
