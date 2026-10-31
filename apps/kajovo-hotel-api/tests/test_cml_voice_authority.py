"""Purpose-bound current CML checks; no provider, native login or paid call."""
import base64
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, CmlVoiceAuthority as AuthorityRow, PortalUser, PortalUserRole
from app.services.cml_voice_authority import CmlVoiceAuthority, ENDPOINT, VoiceAuthorityDenied
from app.services.dagmar_adapter import verified_identity


@pytest.fixture
def authority(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'authority.db'}", connect_args={"check_same_thread": False, "timeout": 15})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    state = {"active": True, "response": None, "offline": False, "requests": [],
             "key": base64.b64encode(os.urandom(32)).decode()}

    def respond(request):
        assert str(request.url) == ENDPOINT
        assert request.method == "POST" and "cookie" not in request.headers and "origin" not in request.headers
        assert request.headers["authorization"].startswith("Bearer ")
        state["requests"].append({"body": json.loads(request.content), "token": request.headers["authorization"][7:]})
        if state["offline"]:
            raise httpx.ConnectError("synthetic authority offline", request=request)
        if state["response"] is not None:
            return state["response"]
        expected = {key: claims[key] for key in ("sid", "epoch", "sub", "nativeId")}
        active = state["active"] and state["requests"][-1] == {"body": expected, "token": token}
        return httpx.Response(200 if active else 401, json={"active": active})

    client = httpx.Client(transport=httpx.MockTransport(respond))
    service = CmlVoiceAuthority(factory, lambda: state["key"], client=client)
    token = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    claims = {"sid": str(uuid4()), "epoch": 1, "sub": "KRMAR78", "nativeId": None, "iss": "https://kajovocml.hcasc.cz",
              "method": "POST", "path": "/cml-web/api/v1/admin/voice-core/calls",
              "aud": "hotel", "role": "admin", "voiceAuthorityHash": hashlib.sha256(token.encode()).hexdigest()}
    try:
        yield service, factory, state, claims, token, respond
    finally:
        service.close()
        engine.dispose()


def test_encrypted_restart_and_exact_original_owner(authority):
    service, factory, state, claims, token, respond = authority
    result = service.admit(claims, token, create=True)
    assert result["session_id"] == "cml:" + claims["sid"]
    assert result["role"] == "admin" and result["portal_user_id"] is None
    with factory() as db:
        row = db.get(AuthorityRow, claims["sid"])
        assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()
        assert token not in row.token_cipher
        original_cipher, original_expiry = row.token_cipher, row.expires_at
    assert verified_identity(service.identity(result["session_id"]))["namespace"] == "admin-profile:1"
    restarted = CmlVoiceAuthority(factory, lambda: state["key"], client=httpx.Client(transport=httpx.MockTransport(respond)))
    try:
        assert restarted.identity(result["session_id"])["session_id"] == result["session_id"]
        assert service.admit(claims, token)["session_id"] == result["session_id"]
        with factory() as db:
            row = db.get(AuthorityRow, claims["sid"])
            assert row.token_cipher == original_cipher and row.expires_at == original_expiry
        assert state["requests"][-1] == {"body": {key: claims[key] for key in ("sid", "epoch", "sub", "nativeId")}, "token": token}
    finally:
        restarted.close()


def test_no_read_can_admit_and_no_unbound_identity_can_query_cml(authority):
    service, factory, state, claims, token, _ = authority
    with pytest.raises(VoiceAuthorityDenied):
        service.admit(claims, token)
    assert service.identity("cml:" + claims["sid"]) is None
    assert service.identity(str(uuid4())) is None
    assert not state["requests"]
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuthorityRow)) == 0


@pytest.mark.parametrize("change", [
    {"voiceAuthorityHash": "0" * 64}, {"aud": "mail"}, {"role": "member"},
    {"sid": "invalid"}, {"epoch": True}, {"sub": "foreign"}, {"nativeId": "123"},
    {"iss": "https://foreign.invalid"}, {"method": "GET"},
    {"path": "/cml-web/api/v1/admin/voice-core/config"}, {"path": "/cml-web/api/v1/admin/voice-core/sessions"},
])
def test_signed_binding_must_match_exact_purpose_before_storage(authority, change):
    service, factory, state, claims, token, _ = authority
    with pytest.raises(VoiceAuthorityDenied):
        service.admit({**claims, **change}, token, create=True)
    assert not state["requests"]
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuthorityRow)) == 0


def test_current_member_admin_keeps_native_actor_and_cannot_be_rebound(authority):
    service, factory, state, claims, token, _ = authority
    with factory() as db:
        db.add(PortalUser(id=7, first_name="Synthetic", last_name="Admin", email="native-admin@example.invalid",
                          password_hash="synthetic-unused", is_active=True, roles=[PortalUserRole(role="admin")]))
        db.commit()
    claims.update(sub="user:" + str(uuid4()), nativeId="7")
    result = service.admit(claims, token, create=True)
    assert result["portal_user_id"] == 7
    assert verified_identity(service.identity(result["session_id"]))["namespace"] == "portal:7"
    with pytest.raises(VoiceAuthorityDenied):
        service.admit({**claims, "sub": "user:" + str(uuid4())}, token, create=True)
    with factory() as db:
        db.get(PortalUser, 7).is_active = False
        db.commit()
    assert service.identity(result["session_id"]) is None
    with pytest.raises(VoiceAuthorityDenied):
        service.admit(claims, token)
    with factory() as db:
        user = db.get(PortalUser, 7)
        user.is_active = True
        user.roles.clear()
        db.commit()
    assert service.identity(result["session_id"]) is None


@pytest.mark.parametrize("response", [{}, {"active": False}, {"active": 1}, {"active": "true"}, {"active": True, "extra": 1}])
def test_only_strict_current_authority_is_accepted(authority, response):
    service, factory, state, claims, token, _ = authority
    state["response"] = httpx.Response(200, json=response)
    with pytest.raises(VoiceAuthorityDenied):
        service.admit(claims, token, create=True)
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuthorityRow)) == 0


def test_background_revocation_offline_and_expiry_fail_closed(authority):
    service, factory, state, claims, token, _ = authority
    owner = service.admit(claims, token, create=True)["session_id"]
    state["active"] = False
    assert service.identity(owner) is None
    state.update(active=True, offline=True)
    assert service.identity(owner) is None
    state["offline"] = False
    state["response"] = httpx.Response(200, content=b"x" * 5000)
    assert service.identity(owner) is None
    state["response"] = None
    with factory() as db:
        db.get(AuthorityRow, claims["sid"]).expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    before = len(state["requests"])
    assert service.identity(owner) is None
    assert len(state["requests"]) == before


def test_changed_local_key_or_stored_binding_cannot_fall_back(authority):
    service, factory, state, claims, token, _ = authority
    owner = service.admit(claims, token, create=True)["session_id"]
    original_key = state["key"]
    state["key"] = base64.b64encode(os.urandom(32)).decode()
    assert service.identity(owner) is None
    with pytest.raises(VoiceAuthorityDenied):
        service.admit(claims, token)
    state["key"] = original_key
    with factory() as db:
        db.get(AuthorityRow, claims["sid"]).epoch = 2
        db.commit()
    assert service.identity(owner) is None


def test_concurrent_admission_keeps_one_immutable_row(authority):
    service, factory, _, claims, token, _ = authority
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: service.admit(claims, token, create=True), range(4)))
    assert all(result["session_id"] == "cml:" + claims["sid"] for result in results)
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(AuthorityRow)) == 1


def test_signed_boundary_and_original_background_port_recheck_before_effect(authority, tmp_path, monkeypatch):
    from pathlib import Path
    from types import SimpleNamespace
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from starlette.responses import JSONResponse
    from dagmar_server.ports import RuntimePorts, authorized, bind
    from app.security.cml_web import CmlWebBoundary
    from app.services.cml_identity import resolve_identity
    from app.services import cml_voice_authority, dagmar_adapter
    from tests.test_cml_web import assertion, fixture_key

    service, factory, state, claims, token, _ = authority
    key, jwks = fixture_key()
    public = tmp_path / "public.json"
    public.write_text(json.dumps(jwks))
    monkeypatch.setenv("CML_WEB_JWKS_PATH", str(public))
    monkeypatch.setattr(cml_voice_authority, "default_authority", lambda: service)
    app, effects = FastAPI(), []
    ports = RuntimePorts(factory, SimpleNamespace(), dagmar_adapter.identity)

    @app.post("/api/v1/admin/voice-core/calls")
    def fake_effect(request: Request):
        owner = request.state._kajovo_auth_session["session_id"]
        if state.get("revoke_before_effect"):
            state["active"] = False
        with bind(ports):
            if not authorized(owner):
                return JSONResponse({"error": "current_authority_required"}, status_code=401)
        effects.append(owner)
        return {"logical_call_id": "synthetic-local-call"}

    @app.get("/api/v1/admin/voice-core/sessions/synthetic")
    def fake_status():
        return {"synthetic": True}

    boundary = CmlWebBoundary(app, audience="hotel", session_factory=factory, resolve_identity=resolve_identity,
                              ui_root=Path(__file__).parents[1] / "app" / "web_ui", voice_authority=service, voice_enabled=True)

    def headers(method, path, body, incoming=token):
        patch = {key: value for key, value in claims.items() if key not in {"method", "path"}}
        result = {"Origin": "https://kajovocml.hcasc.cz", "X-CML-Web-Prefix": "/sections/hotel/",
                  "X-CSRF-Token": "a" * 43, "Content-Type": "application/json",
                  "X-CML-Web-Assertion": assertion(key, "hotel", path=path, method=method, body=body, **patch)}
        if incoming is not None:
            result["X-CML-Voice-Authority"] = incoming
        return result

    path = "/cml-web/api/v1/admin/voice-core/calls"
    with TestClient(boundary) as client:
        read_path = "/cml-web/api/v1/admin/voice-core/sessions/synthetic"
        assert client.get(read_path, headers=headers("GET", read_path, b"")).status_code == 401
        assert client.post(path, content=b"{}", headers=headers("POST", path, b"{}", None)).status_code == 401
        assert client.post(path, content=b"{}", headers=headers("POST", path, b"{}", "b" * 43)).status_code == 401
        assert not effects
        legitimate = headers("POST", path, b"{}")
        response = client.post(path, content=b"{}", headers=legitimate)
        assert response.status_code == 200 and token not in response.text
        assert effects == ["cml:" + claims["sid"]]
        assert client.post(path, content=b"{}", headers=legitimate).status_code == 401
        assert len(effects) == 1
        assert client.get(read_path, headers=headers("GET", read_path, b"")).status_code == 200
        state["revoke_before_effect"] = True
        assert client.post(path, content=b"{}", headers=headers("POST", path, b"{}")).status_code == 401
        assert len(effects) == 1
        with bind(ports):
            assert not authorized("cml:" + claims["sid"])


def test_postgres_migration_and_concurrent_receipt_preserve_existing_state():
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import text
    from sqlalchemy.engine import make_url

    raw = os.getenv("CML_PROFILE_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("Explicit local PostgreSQL authority test database required")
    url = make_url(raw)
    assert url.drivername.startswith("postgresql") and url.host in {"127.0.0.1", "localhost"}
    assert url.database and url.database.endswith("_test")
    schema = "voice_authority_" + uuid4().hex
    admin = create_engine(url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    client = None
    try:
        path = Path(__file__).parents[1] / "alembic" / "versions" / "0051_cml_voice_authority.py"
        spec = importlib.util.spec_from_file_location("isolated_voice_authority_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE protected_fixture(id integer PRIMARY KEY, value text NOT NULL)"))
            connection.execute(text("INSERT INTO protected_fixture VALUES(1,'synthetic-retained-state')"))
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        key, token = base64.b64encode(os.urandom(32)).decode(), base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
        claims = {"sid": str(uuid4()), "epoch": 1, "sub": "KRMAR78", "nativeId": None, "iss": "https://kajovocml.hcasc.cz",
                  "aud": "hotel", "role": "admin", "method": "POST", "path": "/cml-web/api/v1/admin/voice-core/calls",
                  "voiceAuthorityHash": hashlib.sha256(token.encode()).hexdigest()}

        def respond(request):
            assert str(request.url) == ENDPOINT and request.headers["authorization"] == "Bearer " + token
            assert json.loads(request.content) == {key: claims[key] for key in ("sid", "epoch", "sub", "nativeId")}
            return httpx.Response(200, json={"active": True})

        client = httpx.Client(transport=httpx.MockTransport(respond))
        service = CmlVoiceAuthority(factory, lambda: key, client=client)
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _: service.admit(claims, token, create=True), range(4)))
        assert all(row["session_id"] == "cml:" + claims["sid"] for row in results)
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(AuthorityRow)) == 1
            assert db.execute(text("SELECT value FROM protected_fixture WHERE id=1")).scalar_one() == "synthetic-retained-state"
            assert token not in db.get(AuthorityRow, claims["sid"]).token_cipher
    finally:
        if client is not None:
            client.close()
        engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


def test_native_cookie_authority_is_unchanged_and_cml_has_no_legacy_fallback(authority, monkeypatch):
    from app.db.models import AuthSession
    from app.services import cml_voice_authority, dagmar_adapter

    service, factory, state, claims, _, _ = authority
    native_id = str(uuid4())
    with factory() as db:
        for sid in [native_id, "cml:" + claims["sid"]]:
            db.add(AuthSession(session_id=sid, actor_type="admin", principal="synthetic-native@example.invalid",
                               role="admin", roles_json='["admin"]', active_role="admin",
                               expires_at=datetime.now(timezone.utc) + timedelta(hours=1), web_activity_session=False))
        db.commit()
    monkeypatch.setattr(dagmar_adapter, "SessionLocal", factory)
    monkeypatch.setattr(cml_voice_authority, "default_authority", lambda: service)
    state["offline"] = True
    original = dagmar_adapter.identity(native_id)
    assert original["session_id"] == native_id and original["voice_authorized"] is True
    assert dagmar_adapter.identity("cml:" + claims["sid"]) is None
    assert not state["requests"]
