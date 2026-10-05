"""Real hotel HTTP/auth and lifecycle; only paid provider is replaced in CI."""
import base64
import os
import uuid

from app.config import get_settings
from app.main import create_app
from app.services.voice_smart import VoiceBridge, manager
from app.db.session import SessionLocal
from app.db.models import AuditTrail
from dagmar_server.models import LogicalCall
from sqlalchemy import select, func

get_settings().voice_master_key = base64.b64encode(os.urandom(32)).decode()
app = create_app()
greetings = []


async def isolated_provider(sdp, config, key, owner, token, **kwargs):
    bridge=VoiceBridge(owner,"rtc_"+uuid.uuid4().hex,key,token,config,"isolated-provider")
    bridge.logical_call_id=kwargs.get('logical_call_id')
    manager.attach_task(bridge, bridge.logical_call_id)
    async def send(event, match):
        greetings.append(bridge.logical_call_id)
        accepted={'type':'response.created','response':{'id':'fixture-response','metadata':event['response']['metadata']}}
        assert match(accepted)
        return accepted
    bridge.send=send
    bridge.ready.set()
    bridge.technologies="unavailable"
    manager.sessions[bridge.id]=bridge
    return {"sdp":"v=0\r\nisolated-provider", "model":bridge.model, **bridge.public_status(),"managed_functions":[]}


app.state.dagmar.manager.create=isolated_provider



@app.get('/api/__voice_fixture')
def metrics():
    with SessionLocal() as db:
        technical=db.scalar(select(func.count()).select_from(AuditTrail).where(AuditTrail.resource.like('%/voice-core/sessions%')))
        keys=db.scalar(select(func.count()).select_from(AuditTrail).where(AuditTrail.resource.like('%/voice-core/api-key')))
        calls=db.scalars(select(LogicalCall)).all()
        return {'technical_audits':technical,'key_audits':keys,'greetings':len(greetings),'call_count':len(calls),'open_calls':sum(call.open for call in calls)}
