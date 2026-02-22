import hashlib
import http.cookiejar
import json
import os
import socket
import sqlite3
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine

from app.db.models import Base

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]


def _scrypt_hash(password: str, salt: bytes) -> str:
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


@pytest.fixture(scope="session")
def api_db_path(tmp_path_factory: pytest.TempPathFactory) -> Generator[Path, None, None]:
    db_dir = tmp_path_factory.mktemp("kajovo-api-data")
    db_path = db_dir / "test_kajovo_hotel.db"
    if db_path.exists():
        db_path.unlink()

    yield db_path

    if db_path.exists():
        db_path.unlink()


@pytest.fixture(scope="session")
def api_base_url(api_db_path: Path) -> Generator[str, None, None]:
    database_url = f"sqlite:///{api_db_path}"
    engine = create_engine(database_url)
    Base.metadata.create_all(bind=engine)

    with sqlite3.connect(api_db_path) as connection:
        connection.execute(
            "INSERT INTO portal_users (email, role, password_hash, is_active) VALUES (?, ?, ?, 1)",
            (
                "warehouse@example.com",
                "warehouse",
                _scrypt_hash("warehouse-pass", b"warehouse-salt"),
            ),
        )
        connection.execute(
            "INSERT INTO portal_users (email, role, password_hash, is_active) VALUES (?, ?, ?, 1)",
            (
                "maintenance@example.com",
                "maintenance",
                _scrypt_hash("maintenance-pass", b"maintenance-salt"),
            ),
        )
        connection.commit()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]

    env = os.environ.copy()
    env["KAJOVO_API_DATABASE_URL"] = database_url

    proc = subprocess.Popen(
        ["uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd="apps/kajovo-hotel-api",
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    base_url = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=1) as response:
                if response.status == 200:
                    break
        except Exception:
            time.sleep(0.1)
    else:
        output = proc.stdout.read() if proc.stdout else ""
        proc.terminate()
        raise RuntimeError(f"API did not start in time. Uvicorn output:\n{output}")

    try:
        yield base_url
    finally:
        proc.terminate()
        proc.wait(timeout=10)


@pytest.fixture
def api_request(api_base_url: str) -> ApiRequest:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    login_payload = json.dumps({"email": "admin@kajovohotel.local", "password": "admin123"}).encode(
        "utf-8"
    )
    login_request = urllib.request.Request(
        url=f"{api_base_url}/api/auth/admin/login",
        data=login_payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with opener.open(login_request, timeout=10) as response:
        assert response.status == 200

    def _request(
        path: str,
        method: str = "GET",
        payload: dict[str, object] | None = None,
        params: dict[str, str] | None = None,
    ) -> tuple[int, ResponseData]:
        url = f"{api_base_url}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"

        data = None
        headers: dict[str, str] = {}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        if method.upper() in WRITE_METHODS:
            csrf_token = next((cookie.value for cookie in jar if cookie.name == "kajovo_csrf"), "")
            if csrf_token:
                headers["x-csrf-token"] = csrf_token

        request = urllib.request.Request(url=url, data=data, headers=headers, method=method)
        try:
            with opener.open(request, timeout=10) as response:
                raw = response.read().decode("utf-8")
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            parsed = json.loads(raw) if raw else None
            return exc.code, parsed

    return _request
