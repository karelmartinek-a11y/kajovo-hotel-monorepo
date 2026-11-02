from datetime import datetime, timezone
from sqlalchemy import Column, MetaData, Table, create_engine, select
from dagmar_server.models import DagmarBase
from dagmar_server.migrations import upgrade, SHARED_ID


def test_legacy_import_preserves_ids_revisions_tombstones_items_and_namespaced_receipts():
    engine=create_engine('sqlite://')
    legacy=MetaData()
    extra={'namespace','origin_principal_id','creator_namespace','receipt_namespace'}
    for own in DagmarBase.metadata.sorted_tables:
        if own.name=='dagmar_logical_calls':
            continue
        name=own.name.removeprefix('dagmar_')
        Table(name,legacy,*[Column(c.name,c.type,primary_key=c.primary_key,nullable=c.nullable) for c in own.c if c.name not in extra])
    legacy.create_all(engine)
    now=datetime.now(timezone.utc)
    with engine.begin() as conn:
        for index in (1,2):
            conn.execute(legacy.tables['voice_memory_principals'].insert().values(id=f'principal-{index}',portal_user_id=index))
            conn.execute(legacy.tables['voice_memory_settings'].insert().values(principal_id=f'principal-{index}',automatic=index==1,revision=3,generation=4))
            conn.execute(legacy.tables['voice_memory_operations'].insert().values(id=str(index)*64,principal_id=f'principal-{index}',session_id='same-session',call_id='same-key',operation='note_create',arguments_digest='a'*64,result_code='ok',delivered=True,created_at=now))
            conn.execute(legacy.tables['voice_conversation_summaries'].insert().values(id=f'summary-{index}',principal_id=f'principal-{index}',session_id='same-session',topics=[],content='fixture',decisions=[],open_points=[],continuation='',memory_ids=[],source_note_ids=[],search_text='fixture',revision=2,created_at=now,updated_at=now))
        for index in (1,2):
            conn.execute(legacy.tables['voice_smart_operations'].insert().values(request_id='original-request-'+str(index),owner_session_id='owner',call_id='call-'+str(index),arguments_digest='b'*64,status='uncertain',created_at=now))
        conn.execute(legacy.tables['voice_notes'].insert().values(id='note-1',principal_id='principal-1',title='Fixture',normalized_title='fixture',kind='list',content=None,status='archived',revision=5,created_at=now,updated_at=now))
        conn.execute(legacy.tables['voice_note_items'].insert().values(id='item-1',note_id='note-1',content='Fixture item',position=0))
    evidence=upgrade(engine,import_legacy=True)
    assert evidence['tables']['voice_smart_operations']['count_before']==evidence['tables']['voice_smart_operations']['count_after']==2
    assert evidence['tables']['voice_memory_operations']['count_before']==2
    assert evidence['tables']['voice_memory_operations']['count_after']==2
    with engine.connect() as conn:
        rows=conn.execute(select(DagmarBase.metadata.tables['dagmar_voice_memory_operations'])).mappings().all()
        assert {r['id'] for r in rows}=={'1'*64,'2'*64}
        assert {r['principal_id'] for r in rows}=={SHARED_ID}
        assert {r['receipt_namespace'] for r in rows}=={'portal:1','portal:2'}
        assert conn.scalar(select(DagmarBase.metadata.tables['dagmar_voice_notes'].c.revision))==5
        assert conn.scalar(select(DagmarBase.metadata.tables['dagmar_voice_note_items'].c.id))=='item-1'
        assert conn.scalar(select(DagmarBase.metadata.tables['dagmar_voice_memory_settings'].c.automatic).where(DagmarBase.metadata.tables['dagmar_voice_memory_settings'].c.principal_id==SHARED_ID)) is False
        assert len(conn.execute(select(legacy.tables['voice_memory_operations'])).all())==2
    assert upgrade(engine,import_legacy=True)['already_applied']


def test_checksum_is_independent_of_select_order_for_non_id_primary_keys():
    from dagmar_server.migrations import digest_rows
    rows=[{'request_id':'request-a','status':'uncertain'},{'request_id':'request-b','status':'accepted'}]
    assert digest_rows(rows)==digest_rows(list(reversed(rows)))
    assert digest_rows(rows)!=digest_rows([rows[0]])
