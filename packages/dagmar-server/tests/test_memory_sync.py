"""Independent-client commits fence connected and disconnected Dagmar context."""
import asyncio
from types import SimpleNamespace
from sqlalchemy import create_engine, update
from sqlalchemy.orm import Session

from dagmar_server import memory
from dagmar_server.curator import TurnBuffer
from dagmar_server.memory_contract import MemoryRequest
from dagmar_server.memory_sync import synchronize, stamp
from dagmar_server.migrations import upgrade, SHARED_ID
from dagmar_server.ports import RuntimePorts, bind
from dagmar_server.task_context import CallTask
from dagmar_server.turns import TurnCoordinator
from dagmar_server.models import VoiceMemorySettings


def test_external_change_refresh_and_forget_barrier_survive_reconnect(tmp_path):
    engine = create_engine('sqlite:///' + str(tmp_path / 'shared.db'))
    upgrade(engine)
    def factory():
        return Session(engine)
    refreshed, deleted = [], []
    async def refresh():
        refreshed.append(stamp(SHARED_ID))
    async def update_transcription():
        return None
    async def delete_item(iid):
        deleted.append(iid)
    async def scenario():
        task = CallTask()
        task.memory_principal = SHARED_ID
        disconnected = CallTask()
        disconnected.memory_principal = SHARED_ID
        disconnected.groups['stale'] = [{'type':'message','role':'assistant','content':[{'type':'output_text','text':'forgotten'}]}]
        bridge = SimpleNamespace(id='bridge', owner='owner', memory_principal=SHARED_ID, task_context=task,
            closed=False, memory_privacy_paused=False, memory_buffer=None, mail=SimpleNamespace(pending=False, forget=lambda:None),
            partial_text={}, curated_inputs=set(), turns=TurnCoordinator(), human_turns=task.human,
            ws=None, registry=SimpleNamespace(invalidate=lambda:None), dialog_items=['old-memory', 'old-tool'],
            catalog_item=None, call_items={}, memory_outputs={'old-tool'}, protected_items={'old-memory'},
            refresh_memory_context=refresh, update_transcription=update_transcription, delete_item=delete_item)
        app = SimpleNamespace(manager=SimpleNamespace(calls={'connected':task, 'disconnected':disconnected}, sessions={'bridge':bridge}), refreshes={}, memory_stamps={}, memory_sync_locks={})
        with bind(RuntimePorts(factory, SimpleNamespace(), lambda _: {'voice_authorized':True,'namespace':'admin-a'}, application=app)):
            await synchronize(bridge)
            task.groups['ordinary'] = [{'type':'message','role':'assistant','content':[{'type':'output_text','text':'current task'}]}]
            with factory() as db:
                db.execute(update(VoiceMemorySettings).where(VoiceMemorySettings.principal_id == SHARED_ID).values(automatic=False, revision=1, generation=1))
                db.commit()
            await synchronize(bridge)
            await asyncio.sleep(0.08)
            assert task.groups and not task.memory_privacy_paused
            with factory() as db:
                note = memory.execute(db, SHARED_ID, MemoryRequest.model_validate({'request':{'operation':'note_create','title':'External','kind':'list','items':['Value'],'content':None}})).note
            await synchronize(bridge)
            await asyncio.sleep(0.08)
            assert refreshed and not task.memory_privacy_paused
            with factory() as db:
                result = memory.execute(db, SHARED_ID, MemoryRequest.model_validate({'request':{'operation':'note_delete','id':note.id,'revision':note.revision}}))
                assert result.code == 'ok'
            await synchronize(bridge)
            assert set(deleted) == {'old-memory','old-tool'}
            assert task.memory_privacy_paused and disconnected.memory_privacy_paused and not disconnected.groups
            previous = len(refreshed)
            await synchronize(bridge)
            assert len(refreshed) == previous
            # A separate app process has no in-process stamp, but retains the task's epoch.
            app.memory_stamps.clear()
            task.memory_generation -= 1
            await synchronize(bridge)
            assert task.memory_privacy_paused and len(refreshed) > previous
    asyncio.run(scenario())
    engine.dispose()


def test_predelete_buffer_cannot_send_stale_data_to_curator(tmp_path):
    engine = create_engine('sqlite:///' + str(tmp_path / 'curator.db'))
    upgrade(engine)
    def factory():
        return Session(engine)
    extractions = []
    async def extractor(*args):
        extractions.append(True)
        raise AssertionError('stale data sent to curator')
    async def scenario():
        with bind(RuntimePorts(factory, SimpleNamespace(voice_memory_max_calls_per_hour=40), lambda _: None)):
            buffer = TurnBuffer(SHARED_ID, 'session', 'synthetic-key', factory=factory, extractor=extractor)
            buffer.add('user', 0, 'user', 'Remember this project')
            with factory() as db:
                memory.purge(db, SHARED_ID, note_id='00000000-0000-0000-0000-000000000001')
                db.commit()
            await buffer.flush()
            assert not extractions and not buffer.turns and not buffer.enabled
    asyncio.run(scenario())
    engine.dispose()
