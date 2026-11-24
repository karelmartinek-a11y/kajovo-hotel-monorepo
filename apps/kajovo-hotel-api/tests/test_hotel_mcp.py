"""Exercise both MCP entry points with the official client and isolated Hotel state."""

import asyncio
import hashlib
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from fastapi import HTTPException
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
    InventoryEggOrder,
    InventoryItem,
    Issue,
    LostFoundItem,
    LostFoundPhoto,
    PortalUser,
    PortalUserRole,
)
from app.db.session import get_db
from app.db.warehouse import STOCK_TABLES, Warehouse
from app.security.hotel_oauth import (
    BREAKFAST_READ,
    BREAKFAST_WRITE,
    CML,
    ISSUER,
    LOST_FOUND_READ,
    ORIGIN,
    RESOURCE,
)
from app.services import egg_orders, hotel_mcp_file
from tests.test_cml_web import assertion, b64, fixture_key
from tests.test_housekeeping import FakeHousekeepingClient, _reservation

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
    monkeypatch.setattr(
        "app.api.routes.issues.get_settings", lambda: SimpleNamespace(media_root=media_root)
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


class SignedFixtureMember(httpx.Auth):
    def __init__(self, key, permissions):
        self.key = key
        self.claims = {
            "sub": "user:" + str(uuid.uuid4()),
            "nativeId": "1",
            "role": "member",
            "grant": {
                "contract": "kajovo-web-grant/1",
                "permissions": permissions,
                "dataScope": {"kind": "service"},
            },
        }

    async def async_auth_flow(self, request):
        body = await request.aread()
        request.headers.update(
            signed(self.key, request.method, request.url.raw_path.decode(), body, **self.claims)
        )
        yield request


@pytest.mark.parametrize("write_access", [False, True])
def test_oauth_single_module_and_pkce_over_real_application(hotel_mcp_app, write_access):
    app, key, _factory = hotel_mcp_app
    scopes = [BREAKFAST_READ, BREAKFAST_WRITE] if write_access else [BREAKFAST_READ]

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
                    **({} if write_access else {"scope": BREAKFAST_READ}),
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
            owner = {"authzPolicy": "owner-no-additional-prompts/1"}
            if write_access:
                default = await http.get(ISSUER + "/authorize", params=request)
                assert default.status_code == 302
                default_ticket = parse_qs(urlsplit(default.headers["location"]).fragment)["ticket"][
                    0
                ]
                payload = json.dumps({"ticket": default_ticket, "action": "inspect"}).encode()
                default_consent = await http.post(
                    WEB_CONSENT,
                    content=payload,
                    headers=signed(key, "POST", WEB_CONSENT, payload, **owner),
                )
                assert default_consent.json() == {"scopes": [BREAKFAST_READ, LOST_FOUND_READ]}
                request["scope"] = " ".join(scopes)
            else:
                expanded = await http.get(
                    ISSUER + "/authorize",
                    params={**request, "scope": f"{BREAKFAST_READ} {BREAKFAST_WRITE}"},
                )
                assert expanded.status_code == 302
                assert parse_qs(urlsplit(expanded.headers["location"]).query)["error"] == [
                    "invalid_scope"
                ]
            started = await http.get(ISSUER + "/authorize", params=request)
            assert started.status_code == 302
            location = urlsplit(started.headers["location"])
            assert not location.query and location.netloc == urlsplit(CML).netloc
            ticket = parse_qs(location.fragment)["ticket"][0]

            assert (
                await http.get(WEB_CONSENT, headers=signed(key, "GET", WEB_CONSENT, **owner))
            ).status_code == 200
            inspect = json.dumps({"ticket": ticket, "action": "inspect"}).encode()
            inspected = await http.post(
                WEB_CONSENT,
                content=inspect,
                headers=signed(key, "POST", WEB_CONSENT, inspect, **owner),
            )
            assert inspected.json() == {"scopes": scopes}
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
                expected_tools = {
                    "breakfast_day_get",
                    "breakfast_order_get",
                    "breakfast_daily_export",
                }
                if write_access:
                    expected_tools |= {
                        "breakfast_order_create",
                        "breakfast_order_update",
                        "breakfast_order_delete",
                        "breakfast_diet_set",
                        "breakfast_orders_reactivate",
                        "breakfast_orders_delete",
                        "hotel_operation_get",
                    }
                assert {item.name for item in discovery} == expected_tools
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
                if write_access:
                    receipt = await sdk.call_tool(
                        "hotel_operation_get", {"operation_id": str(uuid.uuid4())}
                    )
                    assert receipt.structuredContent["state"] == "not_found"
                    created = await sdk.call_tool(
                        "breakfast_order_create",
                        {
                            "operation_id": str(uuid.uuid4()),
                            "day": DAY.isoformat(),
                            "room_number": "104",
                            "guest_name": "Synthetic OAuth guest",
                            "guest_count": 1,
                        },
                    )
                    assert created.structuredContent["state"] == "completed"
                    order = await sdk.call_tool(
                        "breakfast_order_get", {"order_id": created.structuredContent["record_id"]}
                    )
                    assert order.structuredContent["room_number"] == "104"
                else:
                    scope_denied = await sdk.call_tool(
                        "breakfast_order_delete",
                        {"operation_id": str(uuid.uuid4()), "order_id": first["id"]},
                    )
                    assert scope_denied.isError
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
            assert names == {
                "lost_found_list",
                "lost_found_get",
                "lost_found_photo_get",
                "lost_found_create",
                "lost_found_update",
                "lost_found_delete",
                "lost_found_photo_add",
                "hotel_operation_get",
            }
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
            created = await sdk.call_tool(
                "lost_found_create",
                {
                    "operation_id": str(uuid.uuid4()),
                    "item": {"item_type": "lost", "description": "Synthetic member report"},
                },
            )
            assert created.structuredContent["state"] == "completed"
            blocked_write = await sdk.call_tool(
                "breakfast_orders_delete",
                {"operation_id": str(uuid.uuid4()), "start_day": DAY.isoformat()},
            )
            assert blocked_write.isError
            consent = await http.get(WEB_CONSENT)
            assert consent.status_code == 401
            with factory.begin() as db:
                db.get(PortalUser, 1).is_active = False
            assert (await http.post("/cml-web/mcp", json={})).status_code == 401

    asyncio.run(run())


def test_writes_reuse_native_actions_and_resume_only_the_original_receipt(
    hotel_mcp_app, monkeypatch
):
    app, key, _factory = hotel_mcp_app

    decoded = BytesIO()
    Image.new("RGB", (2, 2)).save(decoded, format="PNG")
    raw_image = decoded.getvalue()
    monkeypatch.setattr(
        hotel_mcp_file, "_address", lambda url: ("files.example.invalid", "192.0.2.1", "/photo")
    )
    monkeypatch.setattr(hotel_mcp_file, "_receive", lambda *_: BytesIO(raw_image))

    class SignedOwner(httpx.Auth):
        async def async_auth_flow(self, request):
            body = await request.aread()
            request.headers.update(
                signed(
                    key,
                    request.method,
                    request.url.raw_path.decode(),
                    body,
                    authzPolicy="owner-no-additional-prompts/1",
                )
            )
            yield request

    async def run():
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app),
                base_url=ORIGIN,
                auth=SignedOwner(),
            ) as http,
            streamable_http_client(ORIGIN + "/cml-web/mcp", http_client=http) as (
                stream,
                writer,
                *_,
            ),
            ClientSession(stream, writer) as sdk,
        ):
            await sdk.initialize()

            async def run_tool(name, **args):
                result = await sdk.call_tool(name, args)
                assert not result.isError, result.content
                return result.structuredContent

            existing_ids = {
                item["id"]
                for item in (await run_tool("breakfast_day_get", day=DAY.isoformat()))["items"]
            }
            order_input = {
                "operation_id": str(uuid.uuid4()),
                "day": DAY.isoformat(),
                "room_number": "104",
                "guest_name": "Synthetic booking",
                "guest_count": 2,
            }
            created = await run_tool("breakfast_order_create", **order_input)
            assert created["state"] == "completed" and created["http_status"] == 201
            assert created["record_id"] not in existing_ids
            assert await run_tool("breakfast_order_create", **order_input) == created
            assert (
                await run_tool(
                    "hotel_operation_get",
                    operation_id=order_input["operation_id"],
                )
                == created
            )
            altered = await sdk.call_tool(
                "breakfast_order_create",
                {**order_input, "guest_count": 3},
            )
            assert altered.isError and "WEB_REQUEST_CONFLICT" in altered.content[0].text

            order_id = created["record_id"]
            updated = await run_tool(
                "breakfast_order_update",
                operation_id=str(uuid.uuid4()),
                order_id=order_id,
                expected_updated_at=created["updated_at"],
                changes={"guest_count": 4},
            )
            assert updated["state"] == "completed", updated
            detail = await run_tool("breakfast_order_get", order_id=order_id)
            assert detail["guest_count"] == 4
            served = await run_tool(
                "breakfast_order_update",
                operation_id=str(uuid.uuid4()),
                order_id=order_id,
                expected_updated_at=detail["updated_at"],
                changes={"status": "served"},
            )
            assert served["state"] == "completed"
            reset = await run_tool(
                "breakfast_orders_reactivate",
                operation_id=str(uuid.uuid4()),
                day=DAY.isoformat(),
            )
            assert reset["state"] == "completed" and reset["http_status"] == 204
            assert (await run_tool("breakfast_order_get", order_id=order_id))["status"] == "pending"
            diet = await run_tool(
                "breakfast_diet_set",
                operation_id=str(uuid.uuid4()),
                order_id=order_id,
                reservation_id="fixture-no-reservation",
                version=1,
                kind="diet_no_milk",
                enabled=True,
            )
            assert diet["state"] == "rejected" and diet["http_status"] == 409

            deleted = await run_tool(
                "breakfast_order_delete",
                operation_id=str(uuid.uuid4()),
                order_id=order_id,
            )
            assert deleted["state"] == "completed" and deleted["http_status"] == 204
            assert (await sdk.call_tool("breakfast_order_get", {"order_id": order_id})).isError
            next_day = (DAY + timedelta(days=1)).isoformat()
            outside = await run_tool(
                "breakfast_order_create",
                **{**order_input, "operation_id": str(uuid.uuid4()), "day": next_day},
            )
            invalid_range = await run_tool(
                "breakfast_orders_delete",
                operation_id=str(uuid.uuid4()),
                start_day=next_day,
                end_day=DAY.isoformat(),
            )
            assert invalid_range["state"] == "rejected" and invalid_range["http_status"] == 400
            assert (await run_tool("breakfast_day_get", day=DAY.isoformat()))["items"]
            cleared = await run_tool(
                "breakfast_orders_delete",
                operation_id=str(uuid.uuid4()),
                start_day=(DAY - timedelta(days=1)).isoformat(),
                end_day=DAY.isoformat(),
            )
            assert cleared["state"] == "completed" and cleared["http_status"] == 204
            assert not (await run_tool("breakfast_day_get", day=DAY.isoformat()))["items"]
            assert (await run_tool("breakfast_order_get", order_id=outside["record_id"]))[
                "room_number"
            ] == "104"

            saved = await run_tool(
                "lost_found_create",
                operation_id=str(uuid.uuid4()),
                item={
                    "item_type": "lost",
                    "description": "Synthetic property",
                    "room_number": "104",
                },
            )
            assert saved["state"] == "completed", saved
            item_id = saved["record_id"]
            upload = {
                "operation_id": str(uuid.uuid4()),
                "item_id": item_id,
                "file": {
                    "file_id": "synthetic-file",
                    "download_url": "https://files.example.invalid/photo",
                },
            }
            photo = await run_tool("lost_found_photo_add", **upload)
            assert photo["state"] == "completed" and photo["photo_id"]
            assert await run_tool("lost_found_photo_add", **upload) == photo
            entry = await run_tool("lost_found_get", item_id=item_id)
            assert [asset["id"] for asset in entry["photos"]] == [photo["photo_id"]]
            schema = next(
                item
                for item in (await sdk.list_tools()).tools
                if item.name == "lost_found_photo_add"
            )
            assert schema.model_dump(mode="json", by_alias=True)["_meta"]["openai/fileParams"] == [
                "file"
            ]
            denied = await run_tool(
                "lost_found_update",
                operation_id=str(uuid.uuid4()),
                item_id=item_id,
                expected_updated_at="2000-01-01T00:00:00",
                changes={"description": "Too old"},
            )
            assert denied["state"] == "rejected" and denied["http_status"] == 409
            applied = await run_tool(
                "lost_found_update",
                operation_id=str(uuid.uuid4()),
                item_id=item_id,
                expected_updated_at=saved["updated_at"],
                changes={"description": "Updated property"},
            )
            assert applied["state"] == "completed"
            data = await run_tool("lost_found_get", item_id=item_id)
            assert data["description"] == "Updated property"
            deleted = await run_tool(
                "lost_found_delete", operation_id=str(uuid.uuid4()), item_id=item_id
            )
            assert deleted["state"] == "completed"
            assert (await sdk.call_tool("lost_found_get", {"item_id": item_id})).isError

    asyncio.run(run())


def test_photo_url_cannot_resolve_to_a_private_address():
    reference = hotel_mcp_file.ChatFile(
        file_id="synthetic",
        download_url="https://127.0.0.1/photo",
    )
    with pytest.raises(HTTPException) as error:
        hotel_mcp_file.download_photo(reference)
    assert error.value.status_code == 422


def test_issues_member_has_only_the_granted_catalog_and_uses_native_actions(
    hotel_mcp_app, monkeypatch
):
    app, key, factory = hotel_mcp_app
    with factory.begin() as db:
        db.add_all(
            [
                Issue(title="Synthetic issue one", location="Corridor", room_number="104"),
                Issue(title="Synthetic issue two", location="Reception", room_number="104"),
            ]
        )
    raw = BytesIO()
    Image.new("RGB", (2, 2)).save(raw, format="PNG")
    monkeypatch.setattr(
        hotel_mcp_file, "_address", lambda _: ("files.example.invalid", "192.0.2.1", "/image")
    )
    monkeypatch.setattr(hotel_mcp_file, "_receive", lambda *_: BytesIO(raw.getvalue()))

    async def run():
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app),
                base_url=ORIGIN,
                auth=SignedFixtureMember(key, ["hotel.issues"]),
            ) as http,
            streamable_http_client(ORIGIN + "/cml-web/mcp", http_client=http) as (read, write, *_),
            ClientSession(read, write) as sdk,
        ):
            await sdk.initialize()
            catalog = (await sdk.list_tools()).tools
            assert {tool.name for tool in catalog} == {
                "issue_list",
                "issue_get",
                "issue_photo_get",
                "issue_create",
                "issue_update",
                "issue_delete",
                "issue_photo_add",
                "hotel_operation_get",
            }
            denied = await sdk.call_tool("breakfast_day_get", {"day": DAY.isoformat()})
            assert denied.isError

            async def call(name, **args):
                result = await sdk.call_tool(name, args)
                assert not result.isError, result.content
                return result.structuredContent

            first = await call("issue_list", room_number="104", limit=1)
            second = await call(
                "issue_list", room_number="104", limit=1, before_id=first["next_before_id"]
            )
            assert [item["id"] for item in first["items"] + second["items"]] == [2, 1]
            created = await call(
                "issue_create",
                operation_id=str(uuid.uuid4()),
                issue={"title": "Test door", "location": "Third corridor", "priority": "high"},
            )
            assert created["state"] == "completed"
            issue_id = created["record_id"]
            stale = await call(
                "issue_update",
                issue_id=issue_id,
                operation_id=str(uuid.uuid4()),
                expected_updated_at="2000-01-01T00:00:00",
                changes={"status": "resolved"},
            )
            assert stale["http_status"] == 409
            update = await call(
                "issue_update",
                issue_id=issue_id,
                operation_id=str(uuid.uuid4()),
                expected_updated_at=created["updated_at"],
                changes={"status": "in_progress"},
            )
            assert update["state"] == "completed"

            upload = {
                "issue_id": issue_id,
                "operation_id": str(uuid.uuid4()),
                "file": {
                    "file_id": "fixture",
                    "download_url": "https://files.example.invalid/image",
                },
            }
            photo = await call("issue_photo_add", **upload)
            assert photo["state"] == "completed"
            assert await call("issue_photo_add", **upload) == photo
            detail = await call("issue_get", issue_id=issue_id)
            assert detail["status"] == "in_progress" and detail["in_progress_at"]
            assert [item["id"] for item in detail["photos"]] == [photo["photo_id"]]
            assert "file_path" not in detail["photos"][0]
            link = await call(
                "issue_photo_get", issue_id=issue_id, photo_id=photo["photo_id"], kind="original"
            )
            response = await http.get(link["href"].replace(CML + "/sections/hotel", "/cml-web"))
            assert response.status_code == 200 and response.content == raw.getvalue()
            deleted = await call("issue_delete", issue_id=issue_id, operation_id=str(uuid.uuid4()))
            assert deleted["http_status"] == 204
            assert (await sdk.call_tool("issue_get", {"issue_id": issue_id})).isError

    asyncio.run(run())


def test_housekeeping_keeps_the_native_room_and_amenity_checks(hotel_mcp_app, monkeypatch):
    app, key, factory = hotel_mcp_app
    day = date(2026, 9, 17)
    client = FakeHousekeepingClient()
    reservation = _reservation(
        "stay-101",
        "room-101",
        "101 KOMFORT",
        arrival=day.isoformat(),
        departure="2026-09-18",
        label="Fixture guest",
        persons=2,
    )
    reservation["bill"] = {"bill_item": [{"label": "Dětská postýlka", "quantity": 1}]}
    monkeypatch.setattr(client, "blocks_for_day", lambda day: [])
    monkeypatch.setattr(client, "reservations_for_day", lambda day, **_: [reservation])
    monkeypatch.setattr("app.services.housekeeping.current_hotel_date", lambda: day)
    monkeypatch.setattr("app.api.routes.housekeeping._client", lambda: client)
    with factory.begin() as db:
        db.get(PortalUser, 1).roles[0].role = "snídaně"

    async def run():
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app),
                base_url=ORIGIN,
                auth=SignedFixtureMember(key, ["hotel.rooms"]),
            ) as http,
            streamable_http_client(ORIGIN + "/cml-web/mcp", http_client=http) as (read, write, *_),
            ClientSession(read, write) as sdk,
        ):
            await sdk.initialize()
            assert {item.name for item in (await sdk.list_tools()).tools} == {
                "housekeeping_rooms_list",
                "housekeeping_room_get",
                "housekeeping_room_status_set",
                "housekeeping_requirement_confirm",
                "housekeeping_amenity_set",
                "hotel_operation_get",
            }
            assert (await sdk.call_tool("issue_list", {})).isError

            async def call(name, **args):
                result = await sdk.call_tool(name, args)
                assert not result.isError, result.content
                return result.structuredContent

            same_day = {"day": day.isoformat()}
            page = await call("housekeeping_rooms_list", **same_day, limit=1)
            assert page["items"][0]["room_id"] == "room-101"
            assert page["items"][0]["arrival_count"] == 1
            assert "guest_label" not in page["items"][0]
            next_page = await call(
                "housekeeping_rooms_list", **same_day, after_room_id=page["next_after_room_id"]
            )
            assert next_page["items"][0]["room_id"] == "room-102"
            room = {"room_id": "room-101", **same_day}
            detail = await call("housekeeping_room_get", **room)
            assert detail["room"]["housekeeping_status_key"] == "dirty"
            assert detail["reservations"] is None

            rejected = await call(
                "housekeeping_room_status_set",
                **room,
                operation_id=str(uuid.uuid4()),
                status="clean",
                expected_status="painted",
            )
            assert rejected["http_status"] == 409 and client.patch_body is None
            change = {
                **room,
                "operation_id": str(uuid.uuid4()),
                "status": "clean",
                "expected_status": "dirty",
            }
            saved = await call("housekeeping_room_status_set", **change)
            assert saved["state"] == "completed"
            assert client.patch_body["room_status_id"] == "clean-id"
            client.patch_body = None
            assert await call("housekeeping_room_status_set", **change) == saved
            assert client.patch_body is None
            detail = await call("housekeeping_room_get", **room, include_reservations=True)
            assert detail["room"]["housekeeping_status_key"] == "clean"
            assert detail["reservations"]["arrivals"][0]["reservation_id"] == "stay-101"

            ready = {
                **room,
                "reservation_id": "stay-101",
                "kind": "cot",
                "version": 0,
                "quantity": 1,
            }
            wrong = await call(
                "housekeeping_requirement_confirm",
                **{**ready, "quantity": 2},
                operation_id=str(uuid.uuid4()),
            )
            assert wrong["http_status"] == 409
            confirmed = await call(
                "housekeeping_requirement_confirm", **ready, operation_id=str(uuid.uuid4())
            )
            assert confirmed["state"] == "completed"
            stay = (await call("housekeeping_room_get", **room, include_reservations=True))[
                "reservations"
            ]["arrivals"][0]
            assert stay["amenities"] == [
                {"kind": "cot", "state": "green", "version": 1, "active": True}
            ]
            manual = {**room, "reservation_id": "stay-101", "kind": "dog"}
            for action, version, extra in (
                ("add", 0, {}),
                ("set_state", 1, {"state": "green"}),
                ("remove", 2, {}),
            ):
                changed = await call(
                    "housekeeping_amenity_set",
                    **manual,
                    action=action,
                    version=version,
                    operation_id=str(uuid.uuid4()),
                    **extra,
                )
                assert changed["state"] == "completed"
            stay = (await call("housekeeping_room_get", **room, include_reservations=True))[
                "reservations"
            ]["arrivals"][0]
            dog = next(amenity for amenity in stay["amenities"] if amenity["kind"] == "dog")
            assert dog == {"kind": "dog", "state": "green", "version": 3, "active": False}

    asyncio.run(run())


def test_inventory_resolves_only_the_scoped_warehouse_and_reuses_native_transactions(
    hotel_mcp_app, monkeypatch, tmp_path
):
    app, key, _factory = hotel_mcp_app
    media_root = tmp_path / "inventory-media"
    monkeypatch.setattr(
        "app.api.routes.inventory.get_settings", lambda: SimpleNamespace(media_root=media_root)
    )
    monkeypatch.setattr("app.db.warehouse.separate_warehouse_databases", lambda: True)
    monkeypatch.setattr("app.api.routes.inventory.separate_warehouse_databases", lambda: True)
    engines = {
        warehouse: create_engine(f"sqlite:///{tmp_path / (warehouse.value + '.sqlite')}")
        for warehouse in Warehouse
    }
    for engine in engines.values():
        Base.metadata.create_all(engine, tables=STOCK_TABLES)
    monkeypatch.setattr("app.db.warehouse.warehouse_engine", lambda _, value: engines[value])
    with sessionmaker(engines[Warehouse.BREAKFAST]).begin() as db:
        db.add_all(
            [
                InventoryItem(name="Synthetic oat", unit="g", current_stock=12, min_stock=3),
                InventoryItem(name="Synthetic oat", unit="g", current_stock=8, min_stock=2),
            ]
        )
    with sessionmaker(engines[Warehouse.DRUGSTORE]).begin() as db:
        db.add(InventoryItem(name="Other warehouse", unit="ks", current_stock=99, min_stock=1))
    raw = BytesIO()
    Image.new("RGB", (2, 2)).save(raw, format="PNG")
    monkeypatch.setattr(
        hotel_mcp_file, "_address", lambda _: ("files.example.invalid", "192.0.2.1", "/image")
    )
    monkeypatch.setattr(hotel_mcp_file, "_receive", lambda *_: BytesIO(raw.getvalue()))

    async def run():
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app),
                base_url=ORIGIN,
                auth=SignedFixtureMember(key, ["hotel.inventory.snidane"]),
            ) as http,
            streamable_http_client(ORIGIN + "/cml-web/mcp", http_client=http) as (read, write, *_),
            ClientSession(read, write) as sdk,
        ):
            await sdk.initialize()
            catalog = {item.name: item.inputSchema for item in (await sdk.list_tools()).tools}
            assert len(catalog) == 21 and "issue_list" not in catalog
            assert catalog["inventory_items_list"]["$defs"]["Warehouse"]["enum"] == ["snidane"]
            assert catalog["inventory_movement_add"]["$defs"]["Warehouse"]["enum"] == ["snidane"]
            denied = await sdk.call_tool(
                "inventory_item_get", {"warehouse": "drogerie", "item_id": 1}
            )
            assert denied.isError

            async def call(name, **args):
                result = await sdk.call_tool(name, {"warehouse": "snidane", **args})
                assert not result.isError, result.content
                return result.structuredContent

            page = await call("inventory_items_list", search="synthetic oat", limit=1)
            second = await call("inventory_items_list", limit=1, after_id=page["next_id"])
            assert [item["id"] for item in page["items"] + second["items"]] == [1, 2]
            item = await call("inventory_item_get", item_id=1)
            updated = await call(
                "inventory_item_update",
                operation_id=str(uuid.uuid4()),
                item_id=1,
                expected_updated_at=item["updated_at"],
                changes={"min_stock": 6},
            )
            assert updated["state"] == "completed"
            move = {
                "operation_id": str(uuid.uuid4()),
                "item_id": 1,
                "movement": {
                    "movement_type": "out",
                    "quantity": 3,
                    "document_date": DAY.isoformat(),
                },
            }
            receipt = await call("inventory_movement_add", **move)
            assert receipt["state"] == "completed"
            assert await call("inventory_movement_add", **move) == receipt
            assert (await call("inventory_item_get", item_id=1))["current_stock"] == 9
            movement_id = receipt["record_id"]
            movement = await call("inventory_movement_get", movement_id=movement_id)
            assert movement["quantity"] == 3 and movement["document_number"].startswith("VY-")

            created = await call(
                "inventory_card_create",
                operation_id=str(uuid.uuid4()),
                card={
                    "card_type": "out",
                    "card_date": DAY.isoformat(),
                    "items": [
                        {"ingredient_id": 1, "quantity_base": 2},
                        {"ingredient_id": 2, "quantity_base": 4},
                    ],
                },
            )
            assert created["state"] == "completed"
            card_id = created["record_id"]
            assert (await call("inventory_cards_list"))["items"][0]["id"] == card_id
            card = await call("inventory_card_get", card_id=card_id, limit=1)
            other_line = await call(
                "inventory_card_get", card_id=card_id, after_id=card["lines"]["next_id"]
            )
            assert {
                line["ingredient_id"]
                for line in card["lines"]["items"] + other_line["lines"]["items"]
            } == {1, 2}
            first_move = await call("inventory_movements_list", item_id=1, limit=1)
            next_move = await call(
                "inventory_movements_list", item_id=1, before_id=first_move["next_id"], limit=1
            )
            assert next_move["items"][0]["id"] == movement_id
            assert (await call("inventory_item_get", item_id=2))["current_stock"] == 4
            card_deleted = await call(
                "inventory_card_delete", operation_id=str(uuid.uuid4()), card_id=card_id
            )
            assert card_deleted["http_status"] == 204
            assert (await call("inventory_item_get", item_id=2))["current_stock"] == 8
            move_deleted = await call(
                "inventory_movement_delete",
                operation_id=str(uuid.uuid4()),
                item_id=1,
                movement_id=movement_id,
            )
            assert move_deleted["http_status"] == 204
            assert (await call("inventory_item_get", item_id=1))["current_stock"] == 12
            activity = await call("inventory_item_activity", item_id=1)
            assert "movement_delete" in {row["action"] for row in activity["items"]}
            blocked = await call("inventory_item_delete", operation_id=str(uuid.uuid4()), item_id=1)
            assert blocked["http_status"] == 400

            photo = await call(
                "inventory_pictogram_set",
                operation_id=str(uuid.uuid4()),
                item_id=2,
                file={
                    "file_id": "inventory-fixture",
                    "download_url": "https://files.example.invalid/image",
                },
            )
            assert photo["state"] == "completed"
            image_link = await call("inventory_pictogram_get", item_id=2, kind="original")
            assert image_link["href"].endswith("warehouse=snidane")
            pdf = await call("inventory_stocktake_pdf")
            assert pdf["href"].endswith("stocktake/pdf?warehouse=snidane")

    try:
        asyncio.run(run())
    finally:
        for engine in engines.values():
            engine.dispose()


def test_egg_order_mcp_reuses_pending_mail_receipt_and_exact_repeat_confirmation(
    hotel_mcp_app, monkeypatch
):
    app, key, factory = hotel_mcp_app
    recipient = "supplier@example.invalid"
    calls = []

    async def fake_mail(config, payload):
        assert config == {"recipient": recipient}
        order_id = payload["send_intent_id"]
        calls.append((payload["kind"], order_id))
        if payload["kind"] == "send":
            raise TimeoutError
        with factory() as db:
            order = db.get(InventoryEggOrder, order_id)
            assert order is not None
            digest = order.content_hash
        return {
            "receipt": {
                "send_intent_id": order_id,
                "idempotency_key": order_id,
                "content_hash": digest,
                "smtp_state": "accepted",
                "operation_id": str(uuid.uuid4()),
                "accepted_recipient_addresses": [recipient],
            }
        }

    monkeypatch.setattr(egg_orders, "mail_config", lambda: {"recipient": recipient})
    monkeypatch.setattr(egg_orders, "call_mail", fake_mail)

    async def run():
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app),
                base_url=ORIGIN,
                auth=SignedFixtureMember(key, ["hotel.inventory.snidane"]),
            ) as http,
            streamable_http_client(ORIGIN + "/cml-web/mcp", http_client=http) as (read, write, *_),
            ClientSession(read, write) as sdk,
        ):
            await sdk.initialize()

            async def call(name, **args):
                result = await sdk.call_tool(name, args)
                assert not result.isError, result.content
                return result.structuredContent

            assert (await call("inventory_egg_order_latest"))["order"] is None
            ident = str(uuid.uuid4())
            first = await call("inventory_egg_order_submit", operation_id=ident)
            assert first["outcome"]["state"] == "unknown"
            assert await call("inventory_egg_order_submit", operation_id=ident) == first
            repeat = str(uuid.uuid4())
            busy = await call("inventory_egg_order_submit", operation_id=repeat)
            assert busy["outcome"] == {"state": "busy", "id": ident}
            resolved = await call("inventory_egg_order_status", order_id=ident)
            assert resolved["state"] == "sent"
            assert (await call("inventory_egg_order_latest"))["order"] == resolved
            confirmation = await call("inventory_egg_order_submit", operation_id=repeat)
            details = confirmation["outcome"]
            assert details["state"] == "confirm" and details["previous_id"] == ident
            wrong = await call(
                "inventory_egg_order_submit",
                operation_id=repeat,
                confirmed_previous_id=ident,
                confirmed_delivery_date="2000-01-01",
            )
            assert wrong == confirmation
            assert calls == [("send", ident), ("status", ident)]
            authorized = await call(
                "inventory_egg_order_submit",
                operation_id=repeat,
                confirmed_previous_id=ident,
                confirmed_delivery_date=details["delivery_date"],
            )
            assert authorized["outcome"]["state"] == "unknown"
            assert calls[-1] == ("send", repeat)

    asyncio.run(run())
