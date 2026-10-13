"""Run inside the authorized API image. initialize/tools/list only; no tool calls."""
import asyncio
import hashlib
import json
import socket

import httpx
from app.services.dagmar_adapter import create_dagmar
from dagmar_server.ports import bind
from dagmar_server.smart import mcp_connection
from dagmar_server.smartplan import SmartPlanClient
from dagmar_server.smartplan_storage import SmartPlanLink
from sqlalchemy import select


async def verify(application):
    settings = application.ports.settings
    result = {'mutations': 0, 'tool_calls': 0}
    for name, url, connector in [
        ('ha', settings.ha_mcp_url, lambda: mcp_connection(settings.ha_mcp_token)),
    ]:
        host = httpx.URL(url).host
        families = {value[0] for value in socket.getaddrinfo(host, 443)}
        async with asyncio.timeout(45):
            async with connector() as session:
                # The connection already verifies initialize, tools/list and contract.
                contract = session.public_contract
                projection = session.model_projection
                schemas = {name: {'input': tool['inputSchema'], 'output': tool.get('outputSchema')} for name, tool in contract.tools.items()}
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
            'contract_version': contract.value['contract_version'],
            'compatibility_profile': contract.value['compatibility_profile'],
            'metadata_digest': contract.metadata_digest,
            'projection_digest': projection['projection_digest'], 'ipv4': socket.AF_INET in families,
            'ipv6': socket.AF_INET6 in families, 'timeout_seconds': 45}
    # Read the host's existing approved link. Never create or approve a new link.
    with application.ports.session_factory() as db:
        subject = db.scalar(select(SmartPlanLink.subject).order_by(SmartPlanLink.subject).limit(1))
    if not subject:
        raise RuntimeError('existing_owner_link_required')
    client = SmartPlanClient(subject)
    try:
        async with asyncio.timeout(45):
            await client.initialize()
            contract = client.contract
            projection = client.projection
            host = httpx.URL(settings.smartplan_base_url).host
            families = {value[0] for value in socket.getaddrinfo(host, 443)}
            async with httpx.AsyncClient(timeout=10, follow_redirects=False) as public:
                denied = await public.post(settings.smartplan_base_url + '/mcp',
                    headers={'Accept': 'application/json, text/event-stream'}, json={
                        'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
                            'protocolVersion': '2025-03-26', 'capabilities': {},
                            'clientInfo': {'name': 'readonly-release-check', 'version': '1'}}})
                assert denied.status_code in {401, 403}
            result['smartplan'] = {'initialize': 'PASS', 'tools_list': 'PASS', 'tools': len(contract.tools),
                'unauthenticated_http_status': denied.status_code,
                'contract_version': contract.value['contract_version'],
                'compatibility_profile': contract.value['compatibility_profile'],
                'metadata_digest': contract.metadata_digest,
                'projection_digest': projection['projection_digest'],
                'ipv4': socket.AF_INET in families, 'ipv6': socket.AF_INET6 in families,
                'timeout_seconds': 45}
    finally:
        await client.close()
    result['provider_ack'] = 'NOT_RUN'
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try:
        application = create_dagmar()
        with bind(application.ports):
            asyncio.run(verify(application))
    except Exception:
        print(json.dumps({'verification': 'FAIL', 'code': 'mcp_contract_or_transport_failed', 'mutations': 0, 'tool_calls': 0}))
        raise SystemExit(1) from None
