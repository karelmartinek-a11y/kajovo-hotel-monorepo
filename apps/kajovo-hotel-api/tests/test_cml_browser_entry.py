"""Cutover denies legacy browser business APIs; native clients and voice stay original."""

import json

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.db.models import AuthSession, Base, PortalUser, PortalUserRole
from app.db.session import get_db
from app.security import auth
from app.security.cml_web import CmlWebBoundary
from app.services import dagmar_adapter
from app.services.cml_identity import resolve_identity
from tests.test_cml_web import assertion, fixture_key


@pytest.fixture
def entry_backend(tmp_path, monkeypatch):
    monkeypatch.setenv("CML_BROWSER_ENTRY_ONLY", "1")
    monkeypatch.setenv("KAJOVO_API_SESSION_SECRET", "synthetic-entry-session-secret-2026")
    key, jwks = fixture_key()
    keyfile = tmp_path / "public.json"
    keyfile.write_text(json.dumps(jwks))
    monkeypatch.setenv("CML_WEB_JWKS_PATH", str(keyfile))
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(auth, "SessionLocal", factory)
    monkeypatch.setattr(dagmar_adapter, "SessionLocal", factory)
    with factory() as db:
        db.add(PortalUser(id=1, first_name="Synthetic", last_name="Local identity", email="entry@example.invalid", password_hash="unused", is_active=True, roles=[PortalUserRole(role="admin")]))
        cookies = {}
        for name, web in [("native", False), ("browser", True)]:
            record = auth.create_session_record(db, principal="entry@example.invalid", role="admin", actor_type="admin", roles=["admin"], active_role="admin", portal_user_id=1, web_activity_session=web)
            cookies[name] = auth.create_session_cookie(record.session_id)
        db.commit()
    app = FastAPI()

    def database():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = database
    app.include_router(auth_router)
    app.include_router(users_router)

    @app.get("/api/v1/admin/voice-core/original-identity")
    def original_voice(request: Request):
        identity = dagmar_adapter.request_identity(request)
        return {"authorized": bool(identity and identity["voice_authorized"])}

    boundary = CmlWebBoundary(app, audience="hotel", session_factory=factory, resolve_identity=resolve_identity, ui_root=tmp_path)
    try:
        with TestClient(boundary) as client:
            yield client, factory, cookies, key
    finally:
        engine.dispose()


@pytest.mark.parametrize("headers", [{"Sec-Fetch-Site": "same-origin"}, {"Sec-Fetch-Mode": "navigate"}, {"Sec-Fetch-Dest": "empty"}, {"Origin": "https://hotel.hcasc.cz"}, {"User-Agent": "Mozilla/5.0 Safari/605.1"}])
def test_browser_cannot_reuse_native_cookie_for_original_business_api(entry_backend, headers):
    client, factory, cookies, _ = entry_backend
    client.cookies.set(auth.SESSION_COOKIE_NAME, cookies["native"])
    before = None
    with factory() as db:
        before = db.get(PortalUser, 1).first_name
    denied = client.get("/api/v1/users", headers=headers)
    assert denied.status_code == 403
    assert denied.json()["detail"]["code"] == "cml_browser_entry_required"
    assert "entry@example.invalid" not in denied.text
    assert client.patch("/api/v1/users/1", headers=headers, json={"first_name": "Forbidden"}).status_code == 403
    with factory() as db:
        assert db.get(PortalUser, 1).first_name == before
        assert db.scalar(select(AuthSession).where(AuthSession.revoked_at.is_not(None))) is None


def test_persisted_web_session_denies_business_without_browser_headers_and_keeps_original_voice(entry_backend):
    client, _, cookies, _ = entry_backend
    client.cookies.set(auth.SESSION_COOKIE_NAME, cookies["browser"])
    assert client.get("/api/v1/users").status_code == 403
    assert client.get("/api/auth/profile").status_code == 403
    assert client.get("/api/v1/admin/voice-core/original-identity", headers={"Sec-Fetch-Site": "same-origin"}).json() == {"authorized": True}
    assert client.get("/api/auth/me").status_code == 200


def test_native_client_and_signed_cml_keep_real_original_data_but_headers_cannot_forge_cml(entry_backend):
    client, _, cookies, key = entry_backend
    client.cookies.set(auth.SESSION_COOKIE_NAME, cookies["native"])
    native = client.get("/api/v1/users", headers={"User-Agent": "okhttp/4.12.0", "X-Kajovo-Android-Version-Code": "999999"})
    assert native.status_code == 200
    assert native.json()[0]["email"] == "entry@example.invalid"
    path = "/cml-web/api/v1/users"
    signed = {"Origin": "https://kajovocml.hcasc.cz", "X-CML-Web-Prefix": "/sections/hotel/", "X-CML-Web-Assertion": assertion(key, "hotel", path=path, method="GET", body=b"")}
    assert client.get("/api/v1/users", headers=signed).status_code == 403
    assert client.get(path).status_code == 401
    result = client.get(path, headers=signed)
    assert result.status_code == 200
    assert result.json() == native.json()
    assert client.get(path, headers=signed).status_code == 401


def test_invalid_cutover_flag_fails_startup(tmp_path, monkeypatch):
    monkeypatch.setenv("CML_BROWSER_ENTRY_ONLY", "mistyped")
    monkeypatch.delenv("CML_WEB_JWKS_PATH", raising=False)
    with pytest.raises(RuntimeError, match="CML_BROWSER_ENTRY_ONLY"):
        CmlWebBoundary(FastAPI(), audience="hotel", session_factory=None, resolve_identity=None, ui_root=tmp_path)
