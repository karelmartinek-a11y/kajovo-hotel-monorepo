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
from collections import deque
from collections.abc import Callable, Generator
from pathlib import Path
from threading import Thread

import pytest
from _pytest.reports import TestReport
from _pytest.runner import CallInfo
from sqlalchemy import create_engine

from app.db.models import Base

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
ResponseData = dict[str, object] | list[dict[str, object]] | None
ApiRequest = Callable[..., tuple[int, ResponseData]]


def _scrypt_hash(password: str, salt: bytes) -> str:
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def _terminate_process(proc: subprocess.Popen[str], timeout_s: float = 10) -> None:
    if proc.poll() is not None:
        return

    proc.terminate()
    try:
        proc.wait(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=timeout_s)


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
def api_server(api_db_path: Path) -> Generator[tuple[str, deque[str]], None, None]:
    database_url = f"sqlite:///{api_db_path}"
    engine = create_engine(database_url)
    Base.metadata.create_all(bind=engine)

    with sqlite3.connect(api_db_path) as connection:
        seeded = [
            ("snidane@example.com", "Snídaně", "Operator", "snidane-pass", "snídaně"),
            ("maintenance@example.com", "Udrzba", "Operator", "maintenance-pass", "údržba"),
            ("reception@example.com", "Recepce", "Operator", "reception-pass", "recepce"),
            ("warehouse@example.com", "Sklad", "Operator", "warehouse-pass", "sklad"),
        ]
        for email, first_name, last_name, password, role in seeded:
            cursor = connection.execute(
                """
                INSERT INTO portal_users (first_name, last_name, email, password_hash, is_active)
                VALUES (?, ?, ?, ?, 1)
                """,
                (first_name, last_name, email, _scrypt_hash(password, email.encode('utf-8')[:16])),
            )
            user_id = int(cursor.lastrowid)
            connection.execute(
                "INSERT INTO portal_user_roles (user_id, role) VALUES (?, ?)",
                (user_id, role),
            )
        connection.commit()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]

    env = os.environ.copy()
    env["KAJOVO_API_DATABASE_URL"] = database_url
    env["KAJOVO_API_ADMIN_PASSWORD"] = "admin123"

    api_app_dir = Path(__file__).resolve().parents[1]

    proc = subprocess.Popen(
        ["uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(api_app_dir),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    logs: deque[str] = deque(maxlen=400)

    def _capture_output() -> None:
        if not proc.stdout:
            return
        for line in proc.stdout:
            logs.append(line.rstrip("\n"))

    output_thread = Thread(target=_capture_output, daemon=True)
    output_thread.start()

    base_url = f"http://127.0.0.1:{port}"
    startup_error: str | None = None
    for _ in range(100):
        if proc.poll() is not None:
            startup_error = f"Uvicorn exited early with code {proc.returncode}."
            break
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=1) as response:
                if response.status == 200:
                    startup_error = None
                    break
        except Exception:
            time.sleep(0.1)
    else:
        startup_error = "API did not start in time."

    if startup_error is not None:
        _terminate_process(proc)
        output_thread.join(timeout=1)
        joined_logs = "\n".join(logs)
        raise RuntimeError(f"{startup_error}\nUvicorn output:\n{joined_logs}")

    try:
        yield base_url, logs
    finally:
        _terminate_process(proc)
        output_thread.join(timeout=1)


@pytest.fixture(scope="session")
def api_base_url(api_server: tuple[str, deque[str]]) -> str:
    return api_server[0]


@pytest.fixture(scope="session")
def api_server_logs(api_server: tuple[str, deque[str]]) -> deque[str]:
    return api_server[1]


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(
    item: pytest.Item,
    call: CallInfo[None],
) -> Generator[None, None, None]:
    outcome = yield
    report = outcome.get_result()
    setattr(item, f"rep_{report.when}", report)


@pytest.fixture(autouse=True)
def api_logs_on_failure(
    request: pytest.FixtureRequest,
    api_server_logs: deque[str],
) -> Generator[None, None, None]:
    yield
    call_report = getattr(request.node, "rep_call", None)
    if isinstance(call_report, TestReport) and call_report.failed:
        joined_logs = "\n".join(api_server_logs)
        if joined_logs:
            print("\n--- Captured API server logs (tail) ---")
            print(joined_logs)
            print("--- End API server logs ---")


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
