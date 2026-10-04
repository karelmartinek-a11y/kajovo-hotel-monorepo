"""Verify migration/constraints/transactions using the production API image and PostgreSQL."""

import subprocess
import time
import uuid
from pathlib import Path


def run(*args):
    result = subprocess.run(args, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:])
    return result.stdout.strip()


def main():
    name = "voice-memory-db-" + uuid.uuid4().hex[:10]
    run("docker", "network", "create", name)
    try:
        run(
            "docker",
            "run",
            "-d",
            "--name",
            name,
            "--network",
            name,
            "--network-alias",
            "postgres",
            "-e",
            "POSTGRES_PASSWORD=memory_test_only",
            "-e",
            "POSTGRES_DB=memory",
            "postgres:16.4-alpine",
        )
        for _ in range(60):
            status = subprocess.run(
                ["docker", "exec", name, "pg_isready", "-U", "postgres"],
                capture_output=True,
            )
            if status.returncode == 0:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("test postgres did not start")

        def api(entrypoint, *args):
            return run(
                "docker",
                "run",
                "--rm",
                "--network",
                name,
                "-e",
                "KAJOVO_API_DATABASE_URL=postgresql+psycopg://postgres:memory_test_only@postgres:5432/memory",
                "--entrypoint",
                entrypoint,
                "kajovo-api-ci",
                *args,
            )

        # Exercise old/new MCP shapes with this exact production image, without backend IO.
        run("docker", "run", "--rm", "-v", str(Path("scripts/verify_voice_mcp_compatibility.py").resolve())+":/tmp/compatibility.py:ro", "--entrypoint", "python", "kajovo-api-ci", "-c", "exec(open('/tmp/compatibility.py').read())")

        # Match the existing production deploy's VARCHAR(128) version storage reconciliation.
        # Historical revision 0002 is longer than Alembic's default VARCHAR(32).
        api(
            "python",
            "-c",
            "from app.db.session import engine; from sqlalchemy import text; c=engine.connect(); c.execute(text('CREATE TABLE alembic_version (version_num VARCHAR(128) NOT NULL PRIMARY KEY)')); c.commit(); c.close()",
        )
        api("alembic", "upgrade", "0041_voice_smart_deliveries")
        api(
            "python",
            "-c",
            "from app.db.session import engine; from sqlalchemy import text; c=engine.connect(); c.execute(text(\"INSERT INTO admin_profile (id,email,password_hash,display_name) VALUES (1,'test@example.invalid','test','Test')\")); c.commit(); c.close()",
        )
        api("alembic", "upgrade", "head")
        code = """
from app.db.session import SessionLocal,engine
from app.db.models import VoiceMemoryPrincipal,VoiceNoteItem,VoiceMemoryOperation,VoiceMemory,VoiceMemoryDependency
from app.services.voice_memory import principal,execute
from app.services.voice_memory_contract import MemoryRequest
from sqlalchemy import select,func,text
with SessionLocal() as db:
    assert db.scalar(text('SELECT version_num FROM alembic_version'))=='0044_voice_mail_operations'
    p=principal(db,{'actor_type':'admin','role':'admin','email':'test@example.invalid'})
    request=MemoryRequest.model_validate({'request':{'operation':'note_create','title':'PG','kind':'list','items':['a','b'],'content':None}})
    first=execute(db,p,request,session_id='pg',call_id='call')
    assert first.code=='ok'
    replay=execute(db,p,request,session_id='pg',call_id='call')
    assert replay.replayed and replay.note.id==first.note.id
    move=MemoryRequest.model_validate({'request':{'operation':'note_item_move','id':first.note.id,'revision':1,'item_id':first.note.items[0].id,'position':1}})
    assert [i.content for i in execute(db,p,move).note.items]==['b','a']
    conflict=execute(db,p,move)
    assert conflict.code=='revision_conflict'
    import asyncio
    from app.services.voice_memory_curator import TurnBuffer,Curated
    async def extract(*args):
        return Curated(candidates=[{'target_id':None,'revision':None,'kind':'project','subject':'Derived','content':'Continue project','tags':[]}],topics=['Project'],summary='Continue project',decisions=[],open_points=[],continuation='Test')
    async def curate():
        b=TurnBuffer(p,'pg-curation','test-only',factory=SessionLocal,extractor=extract)
        b.reference('note',first.note.id)
        b.add('turn',0,'user','Continue project')
        await b.close()
    asyncio.run(curate())
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(VoiceMemoryDependency))==1
    remove=MemoryRequest.model_validate({'request':{'operation':'note_delete','id':first.note.id,'revision':2}})
    assert execute(db,p,remove).code=='ok'
    assert db.scalar(select(func.count()).select_from(VoiceMemory))==0
    assert db.scalar(select(func.count()).select_from(VoiceMemoryDependency))==0
    db.delete(db.get(VoiceMemoryPrincipal,p));db.commit()
    assert db.scalar(select(func.count()).select_from(VoiceNoteItem))==0
    assert db.scalar(select(func.count()).select_from(VoiceMemoryOperation))==0
print('PostgreSQL migration, retries, revisions, ordering and cascades PASS')
from app.services.voice_registry import RegistryConfirmation
from app.services.voice_smart import claim_operation
from app.db.models import VoiceRegistryPlan
from app.time_utils import utc_now
from datetime import timedelta
r=RegistryConfirmation('pg-registry','pg-voice',SessionLocal)
r.prepare({'id':'pg-plan','expires_at':(utc_now()+timedelta(minutes=5)).isoformat(),'requires_confirmation':True,'changes':[{'action':'delete_room','old_name':'Transient PG room','room_ref':'public','status':'planned'}]},'en')
r.begin_readback('pg-response')
r.event({'type':'response.done','response':{'id':'pg-response','status':'completed','output':[{'content':[{'type':'audio','transcript':r.text}]}]}})
r.event({'type':'output_audio_buffer.stopped','response_id':'pg-response'})
r.event({'type':'input_audio_buffer.speech_started','item_id':'pg-audio'})
r.event({'type':'conversation.item.input_audio_transcription.completed','event_id':'pg-event','item_id':'pg-audio','transcript':'yes'})
args={'operation':'registry_apply','plan_id':'pg-plan'}
rid,fresh=claim_operation('pg-registry','pg-voice','pg-call',args,r)
assert fresh
assert claim_operation('pg-registry','pg-voice','pg-call',args,r)==(rid,False)
with SessionLocal() as db:
    row=db.get(VoiceRegistryPlan,r.identity)
    assert row.request_id==rid and row.confirmation_id.startswith('confirmed-')
    assert 'Transient PG room' not in str(row.__dict__)
print('PostgreSQL registry confirmation and atomic write reservation PASS')
from app.services.voice_mail_confirmation import MailConfirmation,draft_hash
from app.services.voice_mail import MailError
from app.db.models import VoiceMailOperation
from app.config import get_settings
import base64,os
get_settings().voice_master_key=base64.b64encode(os.urandom(32)).decode()
draft={'draft_ref':'pg-draft-ref','draft_version':1,'account':'reception','from':'test@example.invalid','to':['recipient@example.invalid'],'cc':[],'bcc':[],'subject':'PG','text_body':'Transient mail body','html_body':None,'reply_to':[],'in_reply_to':None,'references':[]}
candidate={'send_candidate_id':'pg-candidate','draft_ref':'pg-draft-ref','draft_version':1,'sender':draft['from'],'to':draft['to'],'cc':[],'bcc':[],'subject':'PG','body_hash':draft_hash(draft),'expires_at':(utc_now()+timedelta(minutes=5)).isoformat(),'requires_confirmation':True,'confirmation_token':'private-test-canary'}
with SessionLocal() as db:
    db.add(VoiceMailOperation(id='pg-mail',owner_session_id='pg-owner',voice_session_id='pg-voice',call_id='prepare',tool='mail_send_prepare',digest='a'*64,state='pending'))
    db.commit()
c=MailConfirmation('pg-owner','pg-voice',SessionLocal)
c.prepare(candidate,draft,'en','pg-mail')
c.begin_readback('pg-mail-read')
c.event({'type':'output_audio_buffer.started','response_id':'pg-mail-read'})
c.event({'type':'response.done','response':{'id':'pg-mail-read','status':'completed','output':[{'content':[{'type':'audio','transcript':c.text}]}]}})
c.event({'type':'output_audio_buffer.stopped','response_id':'pg-mail-read'})
c.event({'type':'input_audio_buffer.speech_started','item_id':'pg-mail-audio'})
c.event({'type':'conversation.item.input_audio_transcription.completed','event_id':'pg-mail-event','item_id':'pg-mail-audio','transcript':'yes'})
with SessionLocal() as db:
    assert c.reserve(db,'pg-candidate','pg-send')=='private-test-canary'
    db.commit()
with SessionLocal() as db:
    row=db.get(VoiceMailOperation,'pg-mail')
    assert 'Transient mail body' not in str(row.__dict__) and 'private-test-canary' not in row.encrypted_token
    try:
        c.reserve(db,'pg-candidate','pg-send-again')
    except MailError:
        pass
    else:
        raise AssertionError('mail receipt reused')
print('PostgreSQL mail encryption and single-use reservation PASS')

"""
        print(api("python", "-c", code))
        api("alembic", "downgrade", "0041_voice_smart_deliveries")
        api("alembic", "upgrade", "head")
    finally:
        subprocess.run(
            ["docker", "rm", "-fv", name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["docker", "network", "rm", name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


if __name__ == "__main__":
    main()
