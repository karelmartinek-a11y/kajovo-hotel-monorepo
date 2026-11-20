from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from mcp.types import CallToolResult, TextContent
import pytest

from app.api.routes import breakfast
from app.services.breakfast import lighting


def test_breakfast_lighting_authority_and_fixed_payload(monkeypatch):
    app = FastAPI()
    app.include_router(breakfast.router)
    calls = []

    @app.middleware("http")
    async def fixture_identity(request: Request, call_next):
        fixture = request.headers.get("fixture")
        if fixture:
            request.state._kajovo_auth_session = {
                "email": "test@example.invalid",
                "actor_type": "admin" if fixture in {"owner", "native"} else "portal",
                "active_role": "admin" if fixture in {"owner", "native"} else "recepce",
            }
        if fixture in {"owner", "member", "readonly"}:
            request.state.cml_web_claims = {"sub": "KRMAR78" if fixture == "owner" else "user:synthetic"}
        if fixture in {"member", "readonly"}:
            request.state._kajovo_auth_session["cml_permissions"] = ["breakfast:read"]
        if fixture == "member":
            request.state._kajovo_auth_session["cml_permissions"].append("breakfast:write")
        return await call_next(request)

    async def fake_call(config, arguments):
        calls.append(arguments)
        return {"active": arguments.get("active", False), "revision": 1, "status": "pending"}

    monkeypatch.setattr(lighting, "load_config", lambda: {})
    monkeypatch.setattr(lighting, "smart_lighting", fake_call)
    path = "/api/v1/breakfast/lighting"
    with TestClient(app) as client:
        assert client.get(path, headers={"fixture": "owner"}).status_code == 200
        for persona in ("native", "readonly"):
            assert client.get(path, headers={"fixture": persona}).status_code == 403
            assert client.post(path, headers={"fixture": persona}, json={"active": True, "revision": 0}).status_code == 403
        assert client.post(path, headers={"fixture": "member"}, json={
            "active": True, "revision": 0, "target": "lobby", "actor": "forged",
        }).status_code == 422
        response = client.post(path, headers={"fixture": "member"}, json={"active": True, "revision": 0})
        assert response.status_code == 200
        assert response.json()["status"] == "pending"
    assert calls == [
        {"operation": "state"},
        {"operation": "set", "active": True, "revision": 0, "actor": "user:synthetic"},
    ]



def test_smart_rejection_with_empty_structured_response_is_known_not_sent():
    response = CallToolResult(
        isError=True,
        structuredContent={},
        content=[TextContent(type="text", text='{"status":"error","error_code":"ha_stream_discontinuous_not_sent"}')],
    )
    with pytest.raises(lighting.LightingNotSent, match="Smart nemá spojení"):
        lighting.read_result(response)


def test_smart_unknown_response_stays_unverified():
    response = CallToolResult(
        isError=True,
        structuredContent={},
        content=[TextContent(type="text", text='{"status":"error","error_code":"unclassified_error"}')],
    )
    with pytest.raises(ValueError, match="command unavailable"):
        lighting.read_result(response)
