import pytest
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect

from alembic import command
from app.config import get_settings

API_ROOT = Path(__file__).resolve().parents[1]


def _alembic_config() -> Config:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(API_ROOT / "alembic"))
    return config


def test_alembic_has_single_head() -> None:
    script = ScriptDirectory.from_config(_alembic_config())
    assert script.get_heads() == ["0051_cml_voice_authority"]


def test_cml_push_migration_retains_legacy_keys_without_authorizing_them(tmp_path, monkeypatch):
    from sqlalchemy import create_engine, text
    from app.config import get_settings
    database = tmp_path / 'cml-push.db'
    monkeypatch.setenv('KAJOVO_API_DATABASE_URL', f'sqlite:///{database}')
    get_settings.cache_clear()
    config = _alembic_config()
    engine = create_engine(f'sqlite:///{database}')
    try:
        command.upgrade(config, '0049_cml_profile_provision')
        with engine.begin() as db:
            db.execute(text("INSERT INTO chat_participants(id,principal_type,principal_id,email,display_name,is_active)VALUES(1,'portal',1,'synthetic@example.invalid','Synthetic',1)"))
            db.execute(text("INSERT INTO chat_push_subscriptions(id,participant_id,endpoint,p256dh,auth)VALUES(1,1,'https://fcm.googleapis.com/synthetic','synthetic-public-key','synthetic-auth')"))
            before = db.execute(text('SELECT * FROM chat_push_subscriptions')).mappings().one()
        command.upgrade(config, '0050_cml_web_push_authority')
        with engine.connect() as db:
            after = dict(db.execute(text('SELECT * FROM chat_push_subscriptions')).mappings().one())
            assert after.pop('cml_authorized') == 0
            assert after == dict(before)
        with pytest.raises(RuntimeError, match='must survive rollback'):
            command.downgrade(config, '0049_cml_profile_provision')
        with engine.connect() as db:
            assert db.scalar(text('SELECT cml_authorized FROM chat_push_subscriptions')) == 0
            assert db.scalar(text('SELECT version_num FROM alembic_version')) == '0050_cml_web_push_authority'
    finally:
        engine.dispose()
        get_settings.cache_clear()


def test_alembic_upgrade_head_on_clean_sqlite(
    tmp_path, monkeypatch
) -> None:
    db_path = tmp_path / "alembic-head.db"
    monkeypatch.setenv("KAJOVO_API_DATABASE_URL", f"sqlite:///{db_path}")
    get_settings.cache_clear()

    try:
        command.upgrade(_alembic_config(), "head")
    finally:
        get_settings.cache_clear()

    inspector = inspect(create_engine(f"sqlite:///{db_path}"))
    tables = set(inspector.get_table_names())

    assert {"voice_memory_principals", "voice_memory_settings", "voice_memories", "voice_memory_revisions", "voice_notes", "voice_note_items", "voice_conversation_summaries", "voice_memory_operations", "voice_memory_dependencies"} <= tables
    assert "voice_core_settings" in tables
    assert "cml_voice_authority" in tables
    assert "voice_smart_operations" in tables
    assert {"request_id", "owner_session_id", "call_id", "arguments_digest", "status", "created_at"} == {column["name"] for column in inspector.get_columns("voice_smart_operations")}
    assert {"config_json", "revision", "encrypted_api_key"} <= {column["name"] for column in inspector.get_columns("voice_core_settings")}
    assert "admin_profile" in tables
    assert "report_photos" in tables
    assert "device_registrations" in tables
    assert "device_challenges" in tables
    assert "device_access_tokens" in tables
    assert "inventory_cards" in tables
    assert "inventory_card_items" in tables
    assert "breakfast_manual_refresh_jobs" in tables
    assert "reservation_amenities" in tables
    assert {"chat_participants", "chat_conversations", "chat_messages", "chat_push_subscriptions", "chat_push_outbox", "chat_fcm_tokens", "chat_fcm_outbox"} <= tables
    assert "delivered_token_ids" in {column["name"] for column in inspector.get_columns("chat_fcm_outbox")}

    breakfast_columns = {column["name"] for column in inspector.get_columns("breakfast_orders")}
    assert {"guest_names", "country_code", "reservation_details_json"} <= breakfast_columns

    user_columns = {column["name"] for column in inspector.get_columns("portal_users")}
    session_columns = {column["name"] for column in inspector.get_columns("auth_sessions")}
    assert "preferred_locale" in user_columns
    assert {"web_activity_session", "last_activity_at"} <= session_columns

    smtp_columns = {column["name"] for column in inspector.get_columns("portal_smtp_settings")}
    assert "from_email" in smtp_columns
    assert "last_test_connected" in smtp_columns
    assert "last_test_send_attempted" in smtp_columns


def test_cml_voice_authority_survives_code_rollback(tmp_path, monkeypatch):
    from sqlalchemy import text

    database = tmp_path / "voice-authority-rollback.db"
    monkeypatch.setenv("KAJOVO_API_DATABASE_URL", f"sqlite:///{database}")
    get_settings.cache_clear()
    engine = create_engine(f"sqlite:///{database}")
    config = _alembic_config()
    try:
        command.upgrade(config, "head")
        with engine.begin() as db:
            db.execute(text("INSERT INTO cml_voice_authority(sid,subject,epoch,token_hash,token_cipher,expires_at) "
                            "VALUES('synthetic-session','KRMAR78',1,:digest,'synthetic-cipher','2030-01-01')"),
                       {"digest": "a" * 64})
            before = dict(db.execute(text("SELECT * FROM cml_voice_authority")).mappings().one())
        with pytest.raises(RuntimeError, match="do not erase live authorization state"):
            command.downgrade(config, "0050_cml_web_push_authority")
        with engine.connect() as db:
            assert dict(db.execute(text("SELECT * FROM cml_voice_authority")).mappings().one()) == before
            assert db.scalar(text("SELECT version_num FROM alembic_version")) == "0051_cml_voice_authority"
    finally:
        engine.dispose()
        get_settings.cache_clear()


def test_current_checkpoint_preserves_schema_and_journal(tmp_path, monkeypatch) -> None:
    from sqlalchemy import text

    database = tmp_path / "checkpoint.db"
    monkeypatch.setenv("KAJOVO_API_DATABASE_URL", f"sqlite:///{database}")
    get_settings.cache_clear()
    config = _alembic_config()
    script = ScriptDirectory.from_config(config)
    current = script.get_revision("0046_current_voice_schema")
    engine = create_engine(f"sqlite:///{database}")

    def schema():
        inspector = inspect(engine)
        return {name: [{**column, "type": str(column["type"])} for column in inspector.get_columns(name)] for name in inspector.get_table_names()}

    try:
        command.upgrade(config, current.down_revision)
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO voice_smart_deliveries (id, owner_session_id, arguments_digest, status) VALUES ('checkpoint', 'owner', 'digest', 'delivered')"))
        before = schema()
        command.upgrade(config, current.revision)
        assert schema() == before
        command.upgrade(config, current.revision)
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == current.revision
            assert connection.scalar(text("SELECT status FROM voice_smart_deliveries WHERE id='checkpoint'")) == "delivered"
    finally:
        engine.dispose()
        get_settings.cache_clear()


def test_cml_nonce_upgrade_is_additive_and_cannot_remove_replay_protection(tmp_path, monkeypatch) -> None:
    from sqlalchemy import text
    database=tmp_path/"cml-replay.db"
    monkeypatch.setenv("KAJOVO_API_DATABASE_URL",f"sqlite:///{database}")
    get_settings.cache_clear()
    config=_alembic_config()
    engine=create_engine(f"sqlite:///{database}")
    def schema():
        inspector=inspect(engine)
        return {name:[{**column,"type":str(column["type"])}for column in inspector.get_columns(name)]for name in inspector.get_table_names()}
    try:
        command.upgrade(config,"0046_current_voice_schema")
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO voice_smart_deliveries(id,owner_session_id,arguments_digest,status) VALUES('cml-preserve','owner','digest','delivered')"))
        before=schema()
        command.upgrade(config,"0047_cml_web_nonce")
        after=schema()
        assert set(after)==set(before)|{"cml_web_nonce"}
        assert {name:after[name]for name in before}==before
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO cml_web_nonce(jti,expires_at)VALUES('11111111-1111-4111-8111-111111111111',2000000000)"))
        import pytest
        with pytest.raises(RuntimeError,match="replay protection"):
            command.downgrade(config,"0046_current_voice_schema")
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version"))=="0047_cml_web_nonce"
            assert connection.scalar(text("SELECT count(*) FROM cml_web_nonce"))==1
            assert connection.scalar(text("SELECT status FROM voice_smart_deliveries WHERE id='cml-preserve'"))=="delivered"
    finally:
        engine.dispose()
        get_settings.cache_clear()


def test_cml_receipt_upgrade_preserves_native_rows_and_prevents_identity_rollback(tmp_path, monkeypatch):
    import pytest
    from sqlalchemy import text
    database=tmp_path/'cml-receipt.db'
    monkeypatch.setenv('KAJOVO_API_DATABASE_URL',f'sqlite:///{database}')
    get_settings.cache_clear()
    config=_alembic_config()
    engine=create_engine(f'sqlite:///{database}')
    def schema():
        inspector=inspect(engine)
        return {name:[{**column,'type':str(column['type'])}for column in inspector.get_columns(name)]for name in inspector.get_table_names()}
    try:
        command.upgrade(config,'0047_cml_web_nonce')
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO voice_smart_deliveries(id,owner_session_id,arguments_digest,status) VALUES('receipt-preserve','owner','digest','delivered')"))
            conn.execute(text("INSERT INTO cml_web_nonce(jti,expires_at)VALUES('11111111-1111-4111-8111-111111111111',2000000000)"))
        before=schema()
        command.upgrade(config,'0048_cml_web_request')
        after=schema()
        assert set(after)==set(before)|{'cml_web_request'}
        assert {name:after[name]for name in before}==before
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO cml_web_request(owner,request_id,fingerprint,permission,state)VALUES('owner','synthetic-receipt','fingerprint','reports:write','uncertain')"))
        command.upgrade(config,'0048_cml_web_request')
        with pytest.raises(RuntimeError,match='identities must survive'):
            command.downgrade(config,'0047_cml_web_nonce')
        with engine.connect() as conn:
            assert conn.scalar(text('SELECT version_num FROM alembic_version'))=='0048_cml_web_request'
            assert conn.scalar(text('SELECT count(*) FROM cml_web_nonce'))==1
            assert conn.scalar(text('SELECT state FROM cml_web_request'))=='uncertain'
            assert conn.scalar(text("SELECT status FROM voice_smart_deliveries WHERE id='receipt-preserve'"))=='delivered'
    finally:
        engine.dispose()
        get_settings.cache_clear()


def test_cml_profile_upgrade_preserves_native_data_and_immutable_receipt(tmp_path, monkeypatch):
    import pytest
    from sqlalchemy import text
    from sqlalchemy.orm import Session
    from app.db.models import PortalUser, PortalUserRole

    database = tmp_path / "cml-profile.db"
    monkeypatch.setenv("KAJOVO_API_DATABASE_URL", f"sqlite:///{database}")
    get_settings.cache_clear()
    config = _alembic_config()
    engine = create_engine(f"sqlite:///{database}")
    def schema():
        inspector = inspect(engine)
        return {name: [{**column, "type": str(column["type"])} for column in inspector.get_columns(name)] for name in inspector.get_table_names()}
    try:
        command.upgrade(config, "0048_cml_web_request")
        with Session(engine) as db:
            user = PortalUser(first_name="Testovací", last_name="Profil", email="profile-migration@example.invalid", password_hash="synthetic-unusable", roles=[PortalUserRole(role="recepce")])
            db.add(user)
            db.commit()
            native_id = user.id
        before = schema()
        command.upgrade(config, "0049_cml_profile_provision")
        after = schema()
        assert set(after) == set(before) | {"cml_profile_provision"}
        assert {name: after[name] for name in before} == before
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO cml_profile_provision(operation_id,central_user_id,fingerprint,native_id)VALUES(:operation,:central,:fingerprint,:native)"), {"operation":"11111111-1111-4111-8111-111111111111", "central":"22222222-2222-4222-8222-222222222222", "fingerprint":"a" * 64, "native":native_id})
        with pytest.raises(RuntimeError, match="profile receipts must survive"):
            command.downgrade(config, "0048_cml_web_request")
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0049_cml_profile_provision"
            assert connection.scalar(text("SELECT native_id FROM cml_profile_provision")) == native_id
            assert connection.scalar(text("SELECT email FROM portal_users WHERE id=:id"), {"id":native_id}) == "profile-migration@example.invalid"
    finally:
        engine.dispose()
        get_settings.cache_clear()
