"""Exercise both MCP entry points with the official client and isolated Hotel state."""

import asyncio
import hashlib
import json
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.api.hotel_mcp import AUTH_METADATA
from app.db.models import (
    Base,
    BreakfastOrder,
    LostFoundItem,
    LostFoundPhoto,
    PortalUser,
    PortalUserRole,
)
from app.db.session import get_db
from app.security.hotel_oauth import BREAKFAST_READ, CML, ISSUER, LOST_FOUND_READ, ORIGIN, RESOURCE
from tests.test_cml_web import assertion, b64, fixture_key

DAY = date(2026, 11, 24)
CALLBACK = "https://chatgpt.com/connector_platform_oauth_redirect"
WEB_CONSENT = "/cml-web/oauth/consent"


@pytest.fixture
def hotel_mcp_app(monkeypatch, tmp_path):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    media_root = tmp_path / "hotel-media"
    media_root.mkdir()
    portrait = media_root / "fixture.png"
    Image.new("RGB", (2, 2)).save(portrait)
    monkeypatch.setattr(
        "app.api.routes.lost_found.get_settings", lambda: SimpleNamespace(media_root=media_root)
    )
    with factory.begin() as db:
        for room, guests in (("101", 2), ("102", 1), ("103", 0)):
            db.add(
                BreakfastOrder(
                    service_date=DAY,
                    room_number=room,
                    guest_count=guests,
                    guest_name="Synthetic guest",
                )
            )
        for idx, day in enumerate((23, 24, 24)):
            db.add(
                LostFoundItem(
                    item_type="found",
                    status="new",
                    description=f"Fixture detail {idx}",
                    category="other",
                    location="Reception",
                    event_at=datetime(2026, 11, day, tzinfo=timezone.utc),
                    claimant_name="Fixture claimant",
                    photos=[
                        LostFoundPhoto(
                            id=1,
                            mime_type="image/png",
                            size_bytes=portrait.stat().st_size,
                            file_path="fixture.png",
                            thumb_path="fixture.png",
                        ),
                    ]
                    if idx == 2
                    else [],
                )
            )
        db.add(
            PortalUser(
                id=1,
                email="fixture-hotel@example.invalid",
                first_name="Test",
                last_name="Member",
                is_active=True,
                password_hash="fixture",
                roles=[PortalUserRole(role="recepce")],
            )
        )
    key, jwks = fixture_key()
    keyfile = tmp_path / "hotel-mcp-fixture-jwks.json"
    keyfile.write_text(json.dumps(jwks))
    monkeypatch.setenv("CML_WEB_JWKS_PATH", str(keyfile))
    monkeypatch.setattr(main, "SessionLocal", factory)
    for name in ("initialize_database", "initialize_warehouses", "ensure_admin_profile"):
        monkeypatch.setattr(main, name, lambda *_args, **_kwargs: None)

    async def disabled():
        pass

    for name in ("breakfast_scheduler_loop", "breakfast_whatsapp_loop", "lost_found_whatsapp_loop"):
        monkeypatch.setattr(main, name, disabled)

    app = main.create_app()

    def db_override():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    try:
        yield app, key, factory
    finally:
        engine.dispose()


def signed(key, method, path, body=b"", **claims):
    return {
        "Origin": CML,
        "Content-Type": "application/json",
        "X-CML-Web-Prefix": "/sections/hotel/",
        "X-CML-Web-Assertion": assertion(
            key, "hotel", path=path, method=method, body=body, **claims
        ),
        "X-CSRF-Token": "a" * 43,
    }


def test_oauth_single_module_and_pkce_over_real_application(hotel_mcp_app):
    app, key, _factory = hotel_mcp_app

    async def run():
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url=ORIGIN) as http,
        ):
            current = await http.post("/mcp", json={})
            assert current.status_code == 401
            assert "resource_metadata=" in current.headers["www-authenticate"]
            assert (await http.post("/api/v1/breakfast", json={})).status_code == 403
            server = (await http.get(AUTH_METADATA)).json()
            assert server["issuer"] == ISSUER
            assert server["code_challenge_methods_supported"] == ["S256"]
            registration = await http.post(
                ISSUER + "/register",
                json={
                    "redirect_uris": [CALLBACK],
                    "token_endpoint_auth_method": "none",
                    "grant_types": ["authorization_code", "refresh_token"],
                    "response_types": ["code"],
                    "scope": BREAKFAST_READ,
                },
            )
            assert registration.status_code == 201, registration.text
            client_id = registration.json()["client_id"]
            verifier = "v" * 50
            challenge = b64(hashlib.sha256(verifier.encode()).digest())
            request = {
                "client_id": client_id,
                "response_type": "code",
                "redirect_uri": CALLBACK,
                "resource": RESOURCE,
                "code_challenge_method": "S256",
                "code_challenge": challenge,
            }
            started = await http.get(ISSUER + "/authorize", params=request)
            assert started.status_code == 302
            location = urlsplit(started.headers["location"])
            assert not location.query and location.netloc == urlsplit(CML).netloc
            ticket = parse_qs(location.fragment)["ticket"][0]

            owner = {"authzPolicy": "owner-no-additional-prompts/1"}
            assert (
                await http.get(WEB_CONSENT, headers=signed(key, "GET", WEB_CONSENT, **owner))
            ).status_code == 200
            inspect = json.dumps({"ticket": ticket, "action": "inspect"}).encode()
            inspected = await http.post(
                WEB_CONSENT,
                content=inspect,
                headers=signed(key, "POST", WEB_CONSENT, inspect, **owner),
            )
            assert inspected.json() == {"scopes": [BREAKFAST_READ]}
            approve = json.dumps({"ticket": ticket, "action": "approve"}).encode()
            approved = await http.post(
                WEB_CONSENT,
                content=approve,
                headers=signed(key, "POST", WEB_CONSENT, approve, **owner),
            )
            assert approved.status_code == 200
            code = parse_qs(urlsplit(approved.json()["redirect"]).query)["code"][0]
            payload = {
                "client_id": client_id,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": CALLBACK,
                "code_verifier": verifier,
                "resource": RESOURCE,
            }
            assert (
                await http.post(ISSUER + "/token", data={**payload, "resource": ORIGIN})
            ).status_code == 400
            exchange = await http.post(ISSUER + "/token", data=payload)
            assert exchange.status_code == 200, exchange.text
            tokens = exchange.json()
            http.headers["Authorization"] = "Bearer " + tokens["access_token"]
            async with (
                streamable_http_client(RESOURCE, http_client=http) as (read, write, *_),
                ClientSession(read, write) as sdk,
            ):
                await sdk.initialize()
                discovery = (await sdk.list_tools()).tools
                assert {item.name for item in discovery} == {
                    "breakfast_day_get",
                    "breakfast_order_get",
                    "breakfast_daily_export",
                }
                assert all("title" not in item.inputSchema for item in discovery)
                day = await sdk.call_tool("breakfast_day_get", {"day": DAY.isoformat(), "limit": 1})
                assert not day.isError
                assert day.structuredContent["summary"]["total_guests"] == 3
                assert day.structuredContent["summary"]["total_orders"] == 2
                first = day.structuredContent["items"][0]
                assert first["room_number"] == "101" and "guest_name" not in first
                second = await sdk.call_tool(
                    "breakfast_day_get",
                    {"day": DAY.isoformat(), "after": day.structuredContent["next_after"]},
                )
                assert [item["room_number"] for item in second.structuredContent["items"]] == [
                    "102"
                ]
                data = await sdk.call_tool(
                    "breakfast_order_get", {"order_id": first["id"], "include_reservations": True}
                )
                assert data.structuredContent["reservations"] == []
                denied = await sdk.call_tool("lost_found_list", {})
                assert denied.isError
                pdf = await sdk.call_tool("breakfast_daily_export", {"day": DAY.isoformat()})
                link = pdf.structuredContent["href"].replace(CML + "/sections/hotel", "/cml-web")
                response = await http.get(link, headers=signed(key, "GET", link, **owner))
                assert response.status_code == 200 and response.content.startswith(b"%PDF-")

            refresh_params = {
                "client_id": client_id,
                "grant_type": "refresh_token",
                "refresh_token": tokens["refresh_token"],
                "resource": RESOURCE,
            }
            assert (
                await http.post(
                    ISSUER + "/token",
                    data={**refresh_params, "scope": LOST_FOUND_READ},
                )
            ).status_code == 400
            revoked = await http.post(
                ISSUER + "/revoke",
                data={
                    "client_id": client_id,
                    "token": tokens["refresh_token"],
                    "token_type_hint": "refresh_token",
                },
            )
            assert revoked.status_code == 200, revoked.text
            assert (await http.post("/mcp", json={})).status_code == 401

    asyncio.run(run())


def test_signed_member_discovery_is_current_and_uses_native_module_permissions(hotel_mcp_app):
    app, key, factory = hotel_mcp_app
    claims = {
        "sub": "user:" + str(uuid.uuid4()),
        "nativeId": "1",
        "role": "member",
        "grant": {
            "contract": "kajovo-web-grant/1",
            "permissions": ["hotel.lostfound"],
            "dataScope": {"kind": "service"},
        },
    }

    class SignedMember(httpx.Auth):
        async def async_auth_flow(self, request):
            body = await request.aread()
            request.headers.update(
                signed(key, request.method, request.url.raw_path.decode(), body, **claims)
            )
            yield request

    async def run():
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app),
                base_url=ORIGIN,
                auth=SignedMember(),
            ) as http,
            streamable_http_client(ORIGIN + "/cml-web/mcp", http_client=http) as (read, write, *_),
            ClientSession(read, write) as sdk,
        ):
            await sdk.initialize()
            names = {tool.name for tool in (await sdk.list_tools()).tools}
            assert names == {"lost_found_list", "lost_found_get", "lost_found_photo_get"}
            blocked = await sdk.call_tool("breakfast_day_get", {"day": DAY.isoformat()})
            assert blocked.isError
            first = (
                await sdk.call_tool(
                    "lost_found_list",
                    {"item_type": "found", "limit": 1},
                )
            ).structuredContent
            second = (
                await sdk.call_tool(
                    "lost_found_list",
                    {"item_type": "found", "before_id": first["next_before_id"]},
                )
            ).structuredContent
            assert [item["id"] for item in first["items"] + second["items"]] == [3, 2, 1]
            detail = (await sdk.call_tool("lost_found_get", {"item_id": 3})).structuredContent
            assert detail["description"] == "Fixture detail 2"
            assert [photo["id"] for photo in detail["photos"]] == [1]
            assert detail["handover"] is None and detail["whatsapp_notification"] is None
            handover = await sdk.call_tool(
                "lost_found_get", {"item_id": 3, "include_handover": True}
            )
            assert handover.structuredContent["handover"]["claimant_name"] == "Fixture claimant"
            photo = await sdk.call_tool(
                "lost_found_photo_get", {"item_id": 3, "photo_id": 1, "kind": "original"}
            )
            assert photo.structuredContent["kind"] == "photo"
            download = photo.structuredContent["href"].replace(CML + "/sections/hotel", "/cml-web")
            file = await http.get(download)
            assert file.status_code == 200 and file.content.startswith(b"\x89PNG")
            day_filter = await sdk.call_tool(
                "lost_found_list", {"start_day": DAY.isoformat(), "end_day": DAY.isoformat()}
            )
            assert [item["id"] for item in day_filter.structuredContent["items"]] == [3, 2]
            consent = await http.get(WEB_CONSENT)
            assert consent.status_code == 401
            with factory.begin() as db:
                db.get(PortalUser, 1).is_active = False
            assert (await http.post("/cml-web/mcp", json={})).status_code == 401

    asyncio.run(run())
