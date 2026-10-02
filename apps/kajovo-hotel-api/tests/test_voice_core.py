import base64
import json
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from voice_core_server import VoiceCoreConfig

from app.config import get_settings
from app.db.models import AuditTrail, Base, VoiceCoreSettings
from app.db.session import get_db
from app.main import create_app
from app.security import auth
from app.services.voice_core import VoiceSecretAdapter

BASE = "/api/v1/admin/voice-core"
KEY = "sk-test-voice-sensitive-canary"


@pytest.fixture()
def voice_host(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(auth, "SessionLocal", factory)
    monkeypatch.setattr("app.observability.SessionLocal", factory)
    monkeypatch.setattr(get_settings(), "voice_master_key", base64.b64encode(os.urandom(32)).decode())
    app = create_app()
    def database():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = database
    client = TestClient(app, base_url="http://localhost")
    client.cookies.set("kajovo_csrf", "test-csrf")
    client.headers["x-csrf-token"] = "test-csrf"
    def login(actor="admin", role="admin"):
        with factory() as db:
            record = auth.create_session_record(db, principal="test@local.invalid", role=role,
                actor_type=actor, roles=[role], active_role=role)
            db.commit()
            client.cookies.set(auth.SESSION_COOKIE_NAME, auth.create_session_cookie(record.session_id))
    yield client, factory, login
    client.close()
    engine.dispose()


@pytest.mark.parametrize("method,path,body", [("GET", "/config", None),
    ("PUT", "/config", {**VoiceCoreConfig().model_dump(), "revision": 0}),
    ("PUT", "/api-key", {"api_key": KEY}), ("DELETE", "/api-key", None),
    ("POST", "/sessions", {"sdp": "v=0\r\noffer", "revision": 0})])
def test_all_endpoints_require_server_admin(voice_host, method, path, body):
    client, _, login = voice_host
    assert client.request(method, BASE + path, json=body).status_code == 401
    login("portal", "recepce")
    assert client.request(method, BASE + path, json=body, headers={"x-admin": "true", "x-role": "admin"}).status_code == 403
    login("portal", "admin")
    assert client.request(method, BASE + path, json=body).status_code == 403
    login("admin", "recepce")
    assert client.request(method, BASE + path, json=body).status_code == 403


def test_encrypted_save_read_delete_and_no_sensitive_audit(voice_host, caplog):
    client, factory, login = voice_host
    login()
    response = client.put(BASE + "/api-key", json={"api_key": KEY})
    assert response.status_code == 200
    assert response.json()["configured"] is True
    assert KEY not in response.text
    assert response.headers["cache-control"] == "no-store"
    with factory() as db:
        ciphertext = db.get(VoiceCoreSettings, 1).encrypted_api_key
        assert KEY not in ciphertext
        adapter = VoiceSecretAdapter(db)
        assert adapter.read() == KEY
        adapter.save(KEY)
        assert db.get(VoiceCoreSettings, 1).encrypted_api_key != ciphertext
        assert KEY not in str([record.detail for record in db.scalars(select(AuditTrail)).all()])
    assert KEY not in client.get(BASE + "/config").text
    assert client.delete(BASE + "/api-key").json()["configured"] is False
    with factory() as db:
        assert db.get(VoiceCoreSettings, 1).encrypted_api_key is None
    assert KEY not in caplog.text


def test_missing_or_wrong_master_and_tampered_ciphertext_fail_closed(voice_host, monkeypatch):
    client, factory, login = voice_host
    login()
    assert client.put(BASE + "/api-key", json={"api_key": KEY}).status_code == 200
    with factory() as db:
        record = db.get(VoiceCoreSettings, 1)
        record.encrypted_api_key = base64.b64encode(b"x" * 60).decode()
        db.commit()
    response = client.post(BASE + "/sessions", json={"sdp": "v=0\r\noffer", "revision": 1})
    assert response.status_code == 503
    monkeypatch.setattr(get_settings(), "voice_master_key", "")
    assert client.put(BASE + "/api-key", json={"api_key": KEY}).status_code == 503
    # Deletion still works when a key is damaged or the master has been lost.
    assert client.delete(BASE + "/api-key").status_code == 200


def test_config_revision_and_no_prompt_or_tool_overrides(voice_host):
    client, _, login = voice_host
    login()
    config = {**VoiceCoreConfig().model_dump(), "revision": 0, "response_length": "short"}
    assert client.put(BASE + "/config", json=config).status_code == 200
    assert client.put(BASE + "/config", json=config).status_code == 409
    assert client.get(BASE + "/config").json()["response_length"] == "short"
    assert client.put(BASE + "/config", json={**config, "revision": 1, "instructions": KEY}).status_code == 422
    assert client.put(BASE + "/config", json={**config, "revision": 1, "manual_model": "unknown"}).status_code == 422
    response = client.post(BASE + "/sessions", json={"sdp": "v=0\r\noffer", "revision": 1, "tools": []})
    assert response.status_code == 422
    assert KEY not in response.text


def test_csrf_revocation_and_validation_do_not_echo_secrets(voice_host, caplog):
    client, factory, login = voice_host
    login()
    client.headers.pop("x-csrf-token")
    assert client.put(BASE + "/api-key", json={"api_key": KEY}).status_code == 403
    client.headers["x-csrf-token"] = "test-csrf"
    for body in [{"api_key": {"value": KEY}}, {"api_key": KEY, "debug": KEY}]:
        response = client.put(BASE + "/api-key", json=body)
        assert response.status_code == 422 and KEY not in response.text
    response = client.put(BASE + "/api-key", content=KEY, headers={"content-type": "application/json"})
    assert response.status_code == 422 and KEY not in response.text
    with factory() as db:
        assert KEY not in json.dumps([row.detail for row in db.scalars(select(AuditTrail)).all()])
        sid = auth.read_session_cookie(client.cookies.get(auth.SESSION_COOKIE_NAME))["session_id"]
        auth.revoke_session_by_id(db, sid)
    assert client.get(BASE + "/config").status_code == 401
    assert KEY not in caplog.text


def test_session_uses_server_snapshot_only(voice_host, monkeypatch):
    client, _, login = voice_host
    login()
    client.put(BASE + "/api-key", json={"api_key": KEY})
    calls = []
    async def create(sdp, config, key, owner, token):
        calls.append((sdp, config, key))
        return {"sdp": "v=0\r\nanswer", "model": "gpt-realtime-2.1", "session_id": "test-host", "technologies": "unavailable", "managed_functions": ["assistant_memory"]}
    monkeypatch.setattr("app.api.routes.voice_core.manager.create", create)
    result = client.post(BASE + "/sessions", json={"sdp": "v=0\r\noffer", "revision": 1})
    assert result.status_code == 200 and KEY not in result.text
    assert len(calls) == 1 and calls[0][2] == KEY
    assert client.post(BASE + "/sessions", json={"sdp": "v=0\r\noffer", "revision": 0}).status_code == 409
    assert len(calls) == 1


@pytest.mark.parametrize("method,path,body", [
    ("PUT", "/config", {**VoiceCoreConfig().model_dump(), "revision": 0}),
    ("PUT", "/api-key", {"api_key": KEY}), ("DELETE", "/api-key", None),
    ("POST", "/sessions", {"sdp": "v=0\r\noffer", "revision": 0})])
def test_every_write_requires_csrf(voice_host, method, path, body):
    client, _, login = voice_host
    login()
    client.headers.pop("x-csrf-token")
    assert client.request(method, BASE + path, json=body).status_code == 403


def test_key_revision_prevents_stale_config_and_wrong_master(voice_host, monkeypatch):
    client, _, login = voice_host
    login()
    stale = {**VoiceCoreConfig().model_dump(), "revision": 0}
    assert client.put(BASE + "/api-key", json={"api_key": KEY}).json()["revision"] == 1
    assert client.put(BASE + "/config", json=stale).status_code == 409
    monkeypatch.setattr(get_settings(), "voice_master_key", base64.b64encode(os.urandom(32)).decode())
    response = client.post(BASE + "/sessions", json={"sdp": "v=0\r\noffer", "revision": 1})
    assert response.status_code == 503 and KEY not in response.text
    assert client.delete(BASE + "/api-key").json()["revision"] == 2
