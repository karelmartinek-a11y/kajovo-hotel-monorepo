"""Verify migration/constraints/transactions using the production API image and PostgreSQL."""

import subprocess
import time
import uuid


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
    assert db.scalar(text('SELECT version_num FROM alembic_version'))=='0042_voice_memory'
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
