import os
import subprocess
from pathlib import Path

from sqlalchemy import create_engine, inspect, text


def test_registry_upgrade_preserves_previous_head_and_downgrade(tmp_path):
    database = tmp_path / "registry.db"
    env = {**os.environ, "KAJOVO_API_DATABASE_URL": f"sqlite:///{database}", "KAJOVO_API_ENVIRONMENT": "test"}
    root = Path(__file__).resolve().parents[1]
    def migrate(*args):
        result = subprocess.run(["python3.11", "-m", "alembic", *args], cwd=root, env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
    migrate("upgrade", "0042_voice_memory")
    engine = create_engine(f"sqlite:///{database}")
    with engine.begin() as db:
        db.execute(text("INSERT INTO voice_smart_deliveries (id,owner_session_id,arguments_digest,status) VALUES ('prior','owner','digest','delivered')"))
    migrate("upgrade", "head")
    assert "voice_registry_plans" in inspect(engine).get_table_names()
    with engine.connect() as db:
        assert db.scalar(text("SELECT version_num FROM alembic_version")) == "0046_current_voice_schema"
        assert db.scalar(text("SELECT status FROM voice_smart_deliveries WHERE id='prior'")) == "delivered"
    migrate("downgrade", "0042_voice_memory")
    assert "voice_registry_plans" not in inspect(engine).get_table_names()
    assert "voice_memories" in inspect(engine).get_table_names()
    migrate("upgrade", "head")
    engine.dispose()
