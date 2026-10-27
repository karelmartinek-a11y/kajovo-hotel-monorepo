"""Retirement preserves original IDs and uncertainty without executable connectors."""
from sqlalchemy import create_engine, text
from dagmar_server.migrations import upgrade


def test_retirement_preserves_existing_journals_and_nullable_legacy_evidence(tmp_path):
    engine = create_engine('sqlite:///' + str(tmp_path / 'history.db'))
    upgrade(engine)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO dagmar_voice_smart_operations (request_id,owner_session_id,call_id,arguments_digest,status) VALUES ('original-request','owner','call','digest','uncertain')"))
        connection.execute(text("INSERT INTO dagmar_smartplan_deliveries (id,subject,logical_call_id,tool,arguments_digest,state,proposal_id,request_key) VALUES ('original-delivery','owner','logical','smartplan_commit','digest','dispatching','original-proposal','original-key')"))
    upgrade(engine)
    upgrade(engine)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT status FROM dagmar_voice_smart_operations WHERE request_id='original-request'")) == 'uncertain'
        row = connection.execute(text("SELECT * FROM dagmar_smartplan_deliveries WHERE id='original-delivery'")).mappings().one()
        assert row['proposal_id'] == 'original-proposal' and row['request_key'] == 'original-key'
        assert row['state'] == 'dispatching' and row['transport_state'] is None
        assert connection.scalar(text('SELECT count(*) FROM dagmar_smartplan_authorizations')) == 0
        assert connection.scalar(text('SELECT version FROM dagmar_smartplan_schema_version')) == 1
