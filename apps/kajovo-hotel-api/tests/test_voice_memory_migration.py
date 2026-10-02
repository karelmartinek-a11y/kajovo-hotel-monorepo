import os
import subprocess
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

ROOT = Path(__file__).resolve().parents[1]


def test_sqlite_real_upgrade_from_previous_head_and_downgrade(tmp_path):
    database = tmp_path / "migration.db"
    env = {
        **os.environ,
        "KAJOVO_API_DATABASE_URL": f"sqlite:///{database}",
        "KAJOVO_API_ENVIRONMENT": "test",
    }

    def alembic(*args):
        result = subprocess.run(
            ["python3.11", "-m", "alembic", *args],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr

    alembic("upgrade", "0041_voice_smart_deliveries")
    engine = create_engine(f"sqlite:///{database}")
    with engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO admin_profile (id,email,password_hash,display_name) VALUES (1,'migration@example.invalid','test','Test')"
            )
        )
    alembic("upgrade", "head")
    tables = inspect(engine).get_table_names()
    for table in [
        "voice_memory_principals",
        "voice_memory_settings",
        "voice_memories",
        "voice_memory_revisions",
        "voice_notes",
        "voice_note_items",
        "voice_conversation_summaries",
        "voice_memory_operations",
        "voice_memory_dependencies",
    ]:
        assert table in tables
    with engine.connect() as db:
        assert db.scalar(text("SELECT version_num FROM alembic_version")) == "0042_voice_memory"
        assert (
            db.scalar(text("SELECT email FROM admin_profile WHERE id=1"))
            == "migration@example.invalid"
        )
    alembic("downgrade", "0041_voice_smart_deliveries")
    assert "voice_memories" not in inspect(engine).get_table_names()
    alembic("upgrade", "head")
    engine.dispose()
