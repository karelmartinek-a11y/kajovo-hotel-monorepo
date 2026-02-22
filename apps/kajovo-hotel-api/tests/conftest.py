import hashlib
import os
import socket
import sqlite3
import subprocess
import time
from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine

from app.db.models import Base


def _scrypt_hash(password: str, salt: bytes) -> str:
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


@pytest.fixture(scope="session")
def api_base_url() -> Generator[str, None, None]:
    db_path = Path("./test_kajovo_hotel.db")
    if db_path.exists():
        db_path.unlink()

    database_url = f"sqlite:///{db_path}"
    engine = create_engine(database_url)
    Base.metadata.create_all(bind=engine)

    with sqlite3.connect(db_path) as connection:
        connection.execute(
            "INSERT INTO portal_users (email, role, password_hash, is_active) VALUES (?, ?, ?, 1)",
            ("warehouse@example.com", "warehouse", _scrypt_hash("warehouse-pass", b"warehouse-salt")),
        )
        connection.execute(
            "INSERT INTO portal_users (email, role, password_hash, is_active) VALUES (?, ?, ?, 1)",
            ("maintenance@example.com", "maintenance", _scrypt_hash("maintenance-pass", b"maintenance-salt")),
        )
        connection.commit()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]

    env = os.environ.copy()
    env["KAJOVO_API_DATABASE_URL"] = database_url

    proc = subprocess.Popen(
        ["uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=".",
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    base_url = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            import urllib.request

            with urllib.request.urlopen(f"{base_url}/health", timeout=1) as response:
                if response.status == 200:
                    break
        except Exception:
            time.sleep(0.1)
    else:
        proc.terminate()
        raise RuntimeError("API did not start in time")

    try:
        yield base_url
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        if db_path.exists():
            db_path.unlink()
