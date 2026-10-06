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
    assert script.get_heads() == ["0046_current_voice_schema"]


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


def test_current_checkpoint_preserves_schema_and_journal(tmp_path, monkeypatch) -> None:
    from sqlalchemy import text

    database = tmp_path / "checkpoint.db"
    monkeypatch.setenv("KAJOVO_API_DATABASE_URL", f"sqlite:///{database}")
    get_settings.cache_clear()
    config = _alembic_config()
    script = ScriptDirectory.from_config(config)
    current = script.get_revision(script.get_current_head())
    engine = create_engine(f"sqlite:///{database}")

    def schema():
        inspector = inspect(engine)
        return {name: [{**column, "type": str(column["type"])} for column in inspector.get_columns(name)] for name in inspector.get_table_names()}

    try:
        command.upgrade(config, current.down_revision)
        with engine.begin() as connection:
            connection.execute(text("INSERT INTO voice_smart_deliveries (id, owner_session_id, arguments_digest, status) VALUES ('checkpoint', 'owner', 'digest', 'delivered')"))
        before = schema()
        command.upgrade(config, "head")
        assert schema() == before
        command.upgrade(config, "head")
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT version_num FROM alembic_version")) == current.revision
            assert connection.scalar(text("SELECT status FROM voice_smart_deliveries WHERE id='checkpoint'")) == "delivered"
    finally:
        engine.dispose()
        get_settings.cache_clear()
