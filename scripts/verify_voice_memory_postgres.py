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

        # Dagmar schema in a genuinely empty PostgreSQL database, without hotel migrations.
        api("python", "-c", "from sqlalchemy import create_engine,inspect; from dagmar_server.migrations import upgrade; e=create_engine('postgresql+psycopg://postgres:memory_test_only@postgres:5432/memory'); upgrade(e); names=inspect(e).get_table_names(); assert all(n.startswith('dagmar_') for n in names); print('Own empty PostgreSQL schema PASS'); from sqlalchemy import text; c=e.connect(); [c.execute(text('DROP TABLE '+n+' CASCADE')) for n in names]; c.commit(); c.close()")
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
from dagmar_server.models import VoiceMemoryPrincipal,VoiceNoteItem,VoiceMemoryOperation,VoiceMemory,VoiceMemoryDependency
from dagmar_server.migrations import upgrade
from app.db.models import VoiceMemoryPrincipal as OldPrincipal, VoiceMemory as OldMemory
from datetime import datetime,timezone
from dagmar_server.migrations import SHARED_ID
with SessionLocal() as legacy:
    legacy.add(OldPrincipal(id='legacy-pg',admin_profile_id=1));legacy.commit()
    legacy.add(OldMemory(id='legacy-fact',principal_id='legacy-pg',kind='fact',subject='Fixture',content='Preserved fixture',search_text='fixture',origin='explicit',revision=7,created_at=datetime.now(timezone.utc),updated_at=datetime.now(timezone.utc)));legacy.commit()
proof=upgrade(engine,import_legacy=True)
assert proof['tables']['voice_memories']['count_before']==proof['tables']['voice_memories']['count_after']==1
with SessionLocal() as migrated:
    row=migrated.get(VoiceMemory,'legacy-fact')
    assert row.revision==7 and row.origin=='explicit' and row.principal_id==SHARED_ID and row.origin_principal_id=='legacy-pg'
    assert migrated.get(OldMemory,'legacy-fact').content==row.content
    migrated.delete(row);migrated.commit()
from app.services.voice_memory import principal,execute
from app.services.voice_memory_contract import MemoryRequest
from sqlalchemy import select,func,text
from app.services.dagmar_adapter import create_dagmar
from dagmar_server.ports import bind
context=bind(create_dagmar().ports)
context.__enter__()
with SessionLocal() as db:
    assert db.scalar(text('SELECT version_num FROM alembic_version'))=='0046_current_voice_schema'
    p=principal(db,{'voice_authorized':True,'namespace':'pg-test'})
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
from dagmar_server.models import VoiceRegistryPlan
from app.time_utils import utc_now
from datetime import timedelta
r=RegistryConfirmation('pg-registry','pg-voice',SessionLocal)
r.prepare({'id':'pg-plan','expires_at':(utc_now()+timedelta(minutes=5)).isoformat(),'requires_confirmation':True,'changes':[{'action':'delete_room','old_name':'Transient PG room','room_ref':'public','status':'planned'}]},'en')
r.begin_readback('pg-response')
r.event({'type':'output_audio_buffer.started','response_id':'pg-response'})
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
from dagmar_server.mail_storage import MailReceipt,MailSecrets,MailSecretStore
from sqlalchemy.exc import IntegrityError
from dagmar_server.ports import get_settings
import base64
get_settings().voice_master_key=base64.b64encode(b'm'*32).decode()
MailSecretStore().save('synthetic-mcp-fixture','synthetic-control-fixture')
assert MailSecretStore().read()==('synthetic-mcp-fixture','synthetic-control-fixture')
with SessionLocal() as db:
    assert db.scalar(text('SELECT version FROM dagmar_schema_version'))==1
    assert db.scalar(text('SELECT version FROM dagmar_mail_schema_version'))==1
    assert db.scalar(text('SELECT version_num FROM alembic_version'))=='0046_current_voice_schema'
    secret=db.get(MailSecrets,1)
    assert 'synthetic' not in secret.mcp_ciphertext+secret.approval_ciphertext
    fields=dict(owner='pg-owner',logical_call_id='pg-call',voice_session_id='pg-provider',audio_event_id='pg-native-audio',send_request_id='pg-request',content_hash='a'*64,draft_version=1,idempotency_key='pg-send-key',state='reserved',expires_at=utc_now()+timedelta(minutes=5))
    db.add(MailReceipt(id='pg-mail-receipt',approval_request_id='pg-approval',**fields));db.commit()
    db.add(MailReceipt(id='pg-mail-second',approval_request_id='pg-approval-second',**fields))
    try:
        db.commit()
        raise AssertionError('native audio was reusable')
    except IntegrityError:
        db.rollback()
    assert db.scalar(select(func.count()).select_from(MailReceipt))==1
print('PostgreSQL additive Mail marker, encrypted credentials and single-use native audio receipt PASS')

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
