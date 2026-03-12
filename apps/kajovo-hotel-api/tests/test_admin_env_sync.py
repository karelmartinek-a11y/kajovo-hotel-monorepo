import json
import os
import socket
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from sqlalchemy import create_engine

from app.db.models import Base
from app.security.passwords import hash_password, verify_password


def _login(base_url: str, email: str, password: str) -> int:
    request = urllib.request.Request(
        url=f"{base_url}/api/auth/admin/login",
        method="POST",
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code


def test_startup_syncs_admin_profile_from_env(tmp_path: Path) -> None:
    db_path = tmp_path / "admin-sync.db"
    database_url = f"sqlite:///{db_path}"
    engine = create_engine(database_url)
    Base.metadata.create_all(bind=engine)

    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO admin_profile (id, email, password_hash, display_name, password_changed_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                1,
                "stary-admin@example.com",
                hash_password("old-password"),
                "Admin",
                None,
            ),
        )
        connection.commit()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]

    env = {
        "KAJOVO_API_DATABASE_URL": database_url,
        "KAJOVO_API_ADMIN_EMAIL": "fresh-admin@example.com",
        "KAJOVO_API_ADMIN_PASSWORD": "FreshAdminPass-2026",
        "KAJOVO_API_ENVIRONMENT": "test",
        "PYTHONUNBUFFERED": "1",
    }
    proc = subprocess.Popen(
        [
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
            "--no-access-log",
        ],
        cwd=str(Path(__file__).resolve().parents[1]),
        env={**os.environ, **env},
    )

    try:
        base_url = f"http://127.0.0.1:{port}"
        for _ in range(100):
            try:
                with urllib.request.urlopen(f"{base_url}/health", timeout=1) as response:
                    if response.status == 200:
                        break
            except Exception:
                time.sleep(0.1)
        else:
            raise RuntimeError("API did not start in time.")

        assert _login(base_url, "fresh-admin@example.com", "FreshAdminPass-2026") == 200
        assert _login(base_url, "stary-admin@example.com", "old-password") == 401

        with sqlite3.connect(db_path) as connection:
            row = connection.execute(
                "SELECT email, password_hash FROM admin_profile WHERE id = 1"
            ).fetchone()
        assert row is not None
        assert row[0] == "fresh-admin@example.com"
        assert verify_password("FreshAdminPass-2026", row[1]) is True
        assert verify_password("old-password", row[1]) is False
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
