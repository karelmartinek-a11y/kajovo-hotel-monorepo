import os
import subprocess
from pathlib import Path

from sqlalchemy import create_engine, inspect, text


def test_mail_upgrade_and_downgrade_preserves_prior_metadata(tmp_path):
    database = tmp_path / "mail.db"
    env = {**os.environ, "KAJOVO_API_DATABASE_URL": f"sqlite:///{database}", "KAJOVO_API_ENVIRONMENT": "test"}
    root = Path(__file__).resolve().parents[1]
    def migrate(*args):
        result = subprocess.run(["python3.11", "-m", "alembic", *args], cwd=root, env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
    migrate("upgrade", "0043_voice_registry_plans")
    engine = create_engine(f"sqlite:///{database}")
    with engine.begin() as db:
        db.execute(text("INSERT INTO voice_smart_deliveries (id,owner_session_id,arguments_digest,status) VALUES ('prior','owner','digest','delivered')"))
    migrate("upgrade", "head")
    columns = {c["name"] for c in inspect(engine).get_columns("voice_mail_operations")}
    assert {"encrypted_token", "candidate_id", "input_event_id", "send_request_id"} <= columns
    assert not {"body", "text_body", "transcript", "audio"} & columns
    with engine.connect() as db:
        assert db.scalar(text("SELECT version_num FROM alembic_version")) == "0044_voice_mail_operations"
        assert db.scalar(text("SELECT status FROM voice_smart_deliveries WHERE id='prior'")) == "delivered"
    migrate("downgrade", "0043_voice_registry_plans")
    assert "voice_mail_operations" not in inspect(engine).get_table_names()
    assert "voice_registry_plans" in inspect(engine).get_table_names()
    migrate("upgrade", "head")
    engine.dispose()
