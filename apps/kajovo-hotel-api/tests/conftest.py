import hashlib
import base64
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
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

from app.db.models import Base
from tests.test_support import admin_email, admin_login_payload, admin_password

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
ResponseData = dict[str, object] | list[dict[str, object]] | None
REQUEST_TIMEOUT_SECONDS = 45
ApiRequest = Callable[..., tuple[int, ResponseData]]


def pytest_configure(config: pytest.Config) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    base_root = repo_root / "artifacts" / "pytest"
    base_root.mkdir(parents=True, exist_ok=True)
    run_dir = base_root / f"run-{time.strftime('%Y%m%d-%H%M%S')}-{os.getpid()}"
    run_dir.mkdir(parents=True, exist_ok=True)
    config.option.basetemp = str(run_dir)


def _scrypt_hash(password: str, salt: bytes) -> str:
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


@pytest.fixture(scope="session")
def api_db_path(tmp_path_factory: pytest.TempPathFactory) -> Generator[Path, None, None]:
    db_dir = tmp_path_factory.mktemp("kajovo-api-data")
    db_path = db_dir / "test_kajovo_hotel.db"
    if db_path.exists():
        for _ in range(5):
            try:
                db_path.unlink()
                break
            except PermissionError:
                time.sleep(0.2)

    yield db_path

    if db_path.exists():
        for _ in range(10):
            try:
                db_path.unlink()
                break
            except PermissionError:
                time.sleep(0.2)


@pytest.fixture(scope="session")
def cml_web_test_key(api_db_path: Path) -> tuple[Ed25519PrivateKey, Path]:
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    path = api_db_path.parent / "synthetic-cml-public.json"
    path.write_text(json.dumps({'keys': [{'kty':'OKP','crv':'Ed25519','kid':'cml-web-1','x':base64.urlsafe_b64encode(public).decode().rstrip('=')}]}))
    return key, path


@pytest.fixture(scope="session")
def api_base_url(api_db_path: Path, cml_web_test_key: tuple[Ed25519PrivateKey, Path]) -> Generator[str, None, None]:
    database_url = f"sqlite:///{api_db_path}"
    engine = create_engine(database_url)
    Base.metadata.create_all(bind=engine)

    with sqlite3.connect(api_db_path) as connection:
        # Admin account for auth/login tests.
        connection.execute(
            """
            INSERT INTO portal_users (first_name, last_name, email, password_hash, is_active)
            VALUES (?, ?, ?, ?, 1)
            """,
            (
                "Admin",
                "User",
                admin_email(),
                _scrypt_hash(admin_password(), b"admin-salt"),
            ),
        )
        connection.execute(
            """
            INSERT INTO portal_user_roles (user_id, role)
            VALUES ((SELECT id FROM portal_users WHERE email = ?), ?)
            """,
            (admin_email(), "admin"),
        )

        # Portal users for other flows.
        for email, role, password_seed, salt in [
            ("sklad@example.com", "sklad", "sklad", b"sklad-salt"),
            ("udrzba@example.com", "údržba", "udrzba", b"udrzba-salt"),
            ("snidane@example.com", "snídaně", "snidane", b"snidane-salt"),
            ("recepce@example.com", "recepce", "recepce", b"recepce-salt"),
            ("pokojska@example.com", "pokojská", "pokojska", b"pokojska-salt"),
        ]:
            connection.execute(
                """
                INSERT INTO portal_users (first_name, last_name, email, password_hash, is_active)
                VALUES (?, ?, ?, ?, 1)
                """,
                (
                    role.capitalize(),
                    "User",
                    email,
                    _scrypt_hash(f"{password_seed}-pass", salt),
                ),
            )
            connection.execute(
                """
                INSERT INTO portal_user_roles (user_id, role)
                VALUES ((SELECT id FROM portal_users WHERE email = ?), ?)
                """,
                (email, role),
            )

        connection.commit()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]

    env = os.environ.copy()
    env["KAJOVO_API_DATABASE_URL"] = database_url
    env["KAJOVO_API_ADMIN_EMAIL"] = admin_email()
    env["KAJOVO_API_ADMIN_PASSWORD"] = admin_password()
    env["KAJOVO_API_DEVICE_BOOTSTRAP_KEY"] = "test-device-bootstrap-key"
    media_root = api_db_path.parent / "media"
    media_root.mkdir(parents=True, exist_ok=True)
    env["KAJOVO_API_MEDIA_ROOT"] = str(media_root)
    env["KAJOVO_API_SMTP_CAPTURE_PATH"] = str(api_db_path.parent / "smtp-capture.jsonl")
    env["CML_WEB_JWKS_PATH"] = str(cml_web_test_key[1])

    api_app_dir = Path(__file__).resolve().parents[1]

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
        cwd=str(api_app_dir),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )

    base_url = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            with urllib.request.urlopen(f"{base_url}/health", timeout=1) as response:
                if response.status == 200:
                    break
        except Exception:
            time.sleep(0.1)
    else:
        proc.terminate()
        raise RuntimeError("API did not start in time.")

    try:
        yield base_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


@pytest.fixture(scope="session")
def api_mail_capture_path(api_db_path: Path) -> Path:
    return api_db_path.parent / "smtp-capture.jsonl"


@pytest.fixture
def api_request(api_base_url: str) -> ApiRequest:
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    login_payload = json.dumps(admin_login_payload()).encode("utf-8")
    login_request = urllib.request.Request(
        url=f"{api_base_url}/api/auth/admin/login",
        data=login_payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    last_error: Exception | None = None
    for _ in range(10):
        try:
            with opener.open(login_request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                assert response.status == 200
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            time.sleep(0.2)
    if last_error is not None:
        raise last_error

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
            with opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                raw = response.read().decode("utf-8")
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            parsed = json.loads(raw) if raw else None
            return exc.code, parsed

    # Keep references for tests that need the authenticated session.
    _request.opener = opener  # type: ignore[attr-defined]
    _request.jar = jar  # type: ignore[attr-defined]
    _request.api_base_url = api_base_url  # type: ignore[attr-defined]
    return _request




@pytest.fixture
def cml_api_request(api_base_url: str, cml_web_test_key: tuple[Ed25519PrivateKey, Path]) -> ApiRequest:
    key = cml_web_test_key[0]
    def encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).decode().rstrip('=')
    def request(path: str, method: str = 'GET', payload: dict[str, object] | None = None, params: dict[str, str] | None = None) -> tuple[int, ResponseData]:
        native = '/cml-web' + path + ('?' + urllib.parse.urlencode(params) if params else '')
        body = json.dumps(payload).encode() if payload is not None else b''
        now = int(time.time())
        claims = {'iss':'https://kajovocml.hcasc.cz','aud':'hotel','sub':'KRMAR78','role':'admin','nativeId':None,'sid':str(uuid4()),'epoch':1,'iat':now,'exp':now+10,'jti':str(uuid4()),'method':method,'path':native,'bodySha256':hashlib.sha256(body).hexdigest(),'csrf':'a'*43}
        encoded = encode(json.dumps({'typ':'cml-web+jwt','alg':'EdDSA','kid':'cml-web-1'}).encode())+'.'+encode(json.dumps(claims).encode())
        headers = {'Origin':'https://kajovocml.hcasc.cz','X-CML-Web-Prefix':'/sections/hotel/','X-CML-Web-Assertion':encoded+'.'+encode(key.sign(encoded.encode())),'X-CSRF-Token':claims['csrf'],'Content-Type':'application/json'}
        operation = urllib.request.Request(api_base_url+native,data=body if payload is not None else None,headers=headers,method=method)
        try:
            with urllib.request.urlopen(operation,timeout=REQUEST_TIMEOUT_SECONDS) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raw = error.read()
            return error.code, json.loads(raw) if raw else None
    return request


@pytest.fixture(autouse=True)
def portable_dagmar_context():
    # Stateless voice tests also need an explicit host infrastructure context.
    # HTTP fixture contexts override this with their isolated database/auth adapters.
    from app.services.dagmar_adapter import create_dagmar
    from dagmar_server.ports import bind
    application = create_dagmar()
    with bind(application.ports):
        yield
