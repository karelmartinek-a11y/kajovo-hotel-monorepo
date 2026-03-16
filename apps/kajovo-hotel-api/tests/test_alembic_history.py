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
    assert script.get_heads() == ["0024_add_auth_token_purpose"]


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

    assert "admin_profile" in tables
    assert "report_photos" in tables
    assert "device_registrations" in tables
    assert "device_challenges" in tables
    assert "device_access_tokens" in tables
    assert "inventory_cards" in tables
    assert "inventory_card_items" in tables

    smtp_columns = {column["name"] for column in inspector.get_columns("portal_smtp_settings")}
    assert "last_test_connected" in smtp_columns
    assert "last_test_send_attempted" in smtp_columns
