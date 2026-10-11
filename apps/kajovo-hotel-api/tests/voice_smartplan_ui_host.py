"""Isolated real-API browser host: only remote SmartPlan HTTP is substituted."""
import base64
import json
import os
from dataclasses import replace

import httpx
from app.config import get_settings
from app.db.session import SessionLocal
from app.db.models import PortalUser
from sqlalchemy import select
from app.main import create_app
from dagmar_server.application import BoundContext
from dagmar_server.ports import bind
from dagmar_server.smartplan import TOOLS
from dagmar_server.smartplan_storage import SmartPlanSecretStore

get_settings().voice_master_key = base64.b64encode(os.urandom(32)).decode()
app = create_app()


def fixture(request):
    assert request.url.host == 'smartplan.hcasc.cz'
    assert request.headers['Authorization'] == 'Bearer isolated-smartplan-ui-credential'
    if request.method != 'POST':
        return httpx.Response(405)
    body = json.loads(request.content)
    if 'method' in body and 'id' not in body:
        return httpx.Response(202)
    if request.url.path == '/host/link':
        with SessionLocal() as db:
            portal = db.scalar(select(PortalUser).where(PortalUser.email == get_settings().admin_email))
            expected = 'portal:' + str(portal.id) if portal else 'admin-profile:1'
        assert body == {'authenticated_subject': expected}
        return httpx.Response(200, json={'link_id': 'fixture-link', 'approved': False,
            'owner_confirmation_url': 'https://smartplan.hcasc.cz/link/fixture-link'})
    assert request.headers['X-SmartPlan-Link'] == 'fixture-link'
    if body['method'] == 'initialize':
        result = {'serverInfo': {'name': 'SmartPlan', 'version': '1.0.1'}, 'protocolVersion': '2025-11-25', 'capabilities': {'tools': {}}}
    elif body['method'] == 'tools/list':
        result = {'tools': list(TOOLS.values())}
    else:
        raise AssertionError('No tool execution is needed for connection UI')
    return httpx.Response(200, json={'jsonrpc': '2.0', 'id': body['id'], 'result': result})


app.state.dagmar.ports = replace(app.state.dagmar.ports, smartplan_transport=httpx.MockTransport(fixture))
for middleware in app.user_middleware:
    if middleware.cls is BoundContext:
        middleware.kwargs['ports'] = app.state.dagmar.ports


@app.on_event('startup')
def configure_fixture_secret():
    with bind(app.state.dagmar.ports):
        SmartPlanSecretStore().save('isolated-smartplan-ui-credential')
