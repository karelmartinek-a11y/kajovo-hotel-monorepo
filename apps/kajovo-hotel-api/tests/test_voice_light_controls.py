"""Deterministic adapter tests with prepared calls, not spoken-model acceptance."""

import asyncio
import copy
import json
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from dagmar_server.models import VoiceSmartOperation
from app.services import voice_smart
from app.services.smart_technologies import SMART_INSTRUCTIONS, SMART_TOOL

from .test_smart_technologies import bridge, catalog, mcp_result
from .test_voice_core import voice_host as _voice_host

voice_host = _voice_host


class LightMCP:
    """No network IO; describe deliberately advertises settings on toggle too."""

    def __init__(self):
        self.calls = []
        self.status = "accepted"
        self.details = catalog()
        fields = self.details["fields"]
        fields[3]["action_names"] = {
            "on": "Zapnout", "off": "Vypnout", "toggle": "Přepnout", "set": "Nastavit",
        }
        fields[3]["parameter_definitions"]["p"]["properties"] = {
            "rgb_color": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 255}, "minItems": 3, "maxItems": 3},
            "brightness_percent": {"type": "number", "minimum": 0, "maximum": 100},
            "white_temperature_kelvin": {"type": "integer", "minimum": 2000, "maximum": 6500},
        }
        for device, suffix, codes in zip(self.details["devices"], ("Horni", "Spodni"), (("c01", "c03"), ("c03", "c01"))):
            device[0] = "0PHotel" + suffix + "LED"
            device[3] = [[code, "l", action, "p", True, ""] for code, action in ((codes[0], "toggle"), (codes[1], "set"))]
            device[7] = True

    async def call_tool(self, name, payload):
        assert name == "smart_technologie"
        assert payload["api_version"] == 2
        assert payload["session_id"].startswith("session-")
        self.calls.append(copy.deepcopy(payload))
        operation = payload["operation"]
        if operation == "search":
            assert payload["query"] == "HOTEL"
            return mcp_result({
                "catalog_revision": "r1", "total": 2, "has_more": True,
                "selection": {"id": "hotel-all", "count": 2, "expires_at": "2099-01-01T00:00:00Z"},
                "matches": [{"row": 8, "name": self.details["devices"][0][0]}],
            })
        if operation == "describe":
            start, limit = payload.get("offset", 0), payload.get("limit", 8)
            value = copy.deepcopy(self.details)
            value["rows"] = value["rows"][start:start + limit]
            value["devices"] = value["devices"][start:start + limit]
            return mcp_result(value)
        assert operation in {"control", "operation_status"}
        if operation == "control":
            if self.status == "timeout":
                raise TimeoutError("sensitive-transport-canary")
            if "action" in payload:
                assert payload["selection_id"] == "hotel-all"
                assert "rows" not in payload and "controls" not in payload
                if payload["action"] == "nastavit":
                    from jsonschema import validate
                    validate(payload["parameters"], self.details["fields"][3]["parameter_definitions"]["p"])
                else:
                    assert not payload.get("parameters")
        status = "accepted" if operation == "operation_status" else self.status
        return mcp_result({
            "catalog_revision": "r1", "summary": {status: 2},
            "results": [{"row": row, "status": status} for row in (8, 43)],
            "operation": {"status": status},
        }, error=status == "rejected")


@pytest.fixture
def light_host(voice_host, monkeypatch):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: owner == "owner")
    sent, mcp = [], LightMCP()

    def attach(b):
        b.revision, b.catalog_ready = "r1", True
        async def item(value):
            sent.append(copy.deepcopy(value))
            return value["id"]
        async def delete_item(iid):
            pass
        b.mcp, b.item, b.delete_item = mcp, item, delete_item
        return b

    async def call(b, cid, args):
        await b.result({"name": "smart_technologie", "call_id": cid, "arguments": json.dumps(args)})

    return SimpleNamespace(b=attach(bridge()), mcp=mcp, sent=sent, factory=factory, attach=attach, call=call)


@pytest.mark.parametrize("action,parameters", [
    pytest.param("nastavit", {"rgb_color": [255, 0, 0]}, id="HOTEL-red"),
    pytest.param("nastavit", {"brightness_percent": 50}, id="HOTEL-brightness-50"),
    pytest.param("nastavit", {"white_temperature_kelvin": 3000}, id="HOTEL-white-temperature"),
    pytest.param("prepnout", None, id="explicit-on-off-toggle"),
    pytest.param("zapnout", None, id="turn-on"),
    pytest.param("vypnout", None, id="turn-off"),
])
def test_prepared_light_actions_preserve_describe_parameters_and_entire_group(light_host, action, parameters):
    h = light_host
    async def scenario():
        await h.call(h.b, "search", {"operation": "search", "query": "HOTEL", "limit": 1})
        for offset in (0, 1):
            await h.call(h.b, f"describe-{offset}", {"operation": "describe", "selection_id": "hotel-all", "offset": offset, "limit": 1})
        args = {"operation": "control", "selection_id": "hotel-all", "action": action, "request_id": "model-cannot-own-identity"}
        if parameters:
            args["parameters"] = parameters
        await h.call(h.b, "control", args)
        payload = h.mcp.calls[-1]
        assert payload["action"] == action and payload.get("parameters") == parameters
        assert payload["selection_id"] == "hotel-all"
        assert payload["request_id"] == voice_smart.request_id(h.b.id, "control")
        assert payload["session_id"] == "session-" + h.b.id
        assert [p["operation"] for p in h.mcp.calls] == ["search", "describe", "describe", "control"]
        output = json.loads(next(v["output"] for v in reversed(h.sent) if v["type"] == "function_call_output"))
        assert output["summary"] == {"accepted": 2}
        assert [r["row"] for r in output["results"]] == [8, 43]
        assert not any(key in output for key in ("executed", "physically_verified"))
        with h.factory() as db:
            record = db.get(VoiceSmartOperation, payload["request_id"])
            assert record.status == "completed" and record.owner_session_id == "owner"
    asyncio.run(scenario())


@pytest.mark.parametrize("action", ["zapnout", "vypnout", "prepnout"])
@pytest.mark.parametrize("parameters", [{"rgb_color": [255, 0, 0]}, {"brightness_percent": 50}, {"white_temperature_kelvin": 3000}])
def test_power_with_settings_is_not_sent_or_rewritten(light_host, action, parameters):
    h = light_host
    async def scenario():
        await h.call(h.b, "invalid", {"operation": "control", "selection_id": "sensitive-selection", "action": action, "parameters": parameters})
        output = json.loads(h.sent[-1]["output"])
        assert output["error"] == "invalid_arguments" and output["not_sent"] is True
        assert output["validation_issues"] == [{"field": "operation", "rule": "settings_require_nastavit"}]
        assert "nastavit" in output["message"]
        assert "request_id" not in output and "sensitive-selection" not in json.dumps(output)
        assert h.mcp.calls == []
        with h.factory() as db:
            assert db.scalars(select(VoiceSmartOperation)).all() == []
    asyncio.run(scenario())


def test_described_function_codes_are_forwarded_without_universal_mapping(light_host):
    h = light_host
    async def scenario():
        await h.call(h.b, "describe", {"operation": "describe", "selection_id": "hotel-all"})
        details = h.mcp.details
        controls = []
        for row, device in zip(details["rows"], details["devices"]):
            function = next(c[0] for c in device[3] if details["fields"][3]["action_names"][c[2]] == "Nastavit")
            controls.append({"row": row, "function": function, "parameters": {"rgb_color": [255, 0, 0]}})
        await h.call(h.b, "individual", {"operation": "control", "catalog_revision": "r1", "controls": controls})
        assert h.mcp.calls[-1]["controls"] == controls
        assert [c["function"] for c in controls] == ["c03", "c01"]
        assert "action" not in h.mcp.calls[-1]
    asyncio.run(scenario())


def test_group_settings_deduplicate_after_bridge_restart(light_host):
    h = light_host
    async def scenario():
        args = {"operation": "control", "selection_id": "hotel-all", "action": "nastavit", "parameters": {"rgb_color": [255, 0, 0]}}
        await h.call(h.b, "stable", args)
        await h.call(h.b, "stable", args)
        await h.call(h.attach(bridge()), "stable", args)
        assert len(h.mcp.calls) == 1
        assert len([v for v in h.sent if v["type"] == "function_call_output"]) == 1
    asyncio.run(scenario())


@pytest.mark.parametrize("status", ["rejected", "uncertain", "timeout"])
def test_sent_settings_failure_never_causes_corrective_control(light_host, status):
    h = light_host
    h.mcp.status = status
    async def scenario():
        args = {"operation": "control", "selection_id": "hotel-all", "action": "nastavit", "parameters": {"brightness_percent": 50}}
        await h.call(h.b, "failure", args)
        output = json.loads(next(v["output"] for v in reversed(h.sent) if v["type"] == "function_call_output"))
        rid = h.mcp.calls[0]["request_id"]
        assert output["request_id"] == rid and "not_sent" not in output
        assert "sensitive-transport-canary" not in json.dumps(output)
        await h.call(h.b, "failure", args)
        assert len(h.mcp.calls) == 1
        with h.factory() as db:
            assert db.get(VoiceSmartOperation, rid).status == ("completed" if status == "rejected" else "uncertain")
        recovered = h.attach(bridge())
        await h.call(recovered, "failure", args)
        assert len(h.mcp.calls) == 1
        if status != "rejected":
            assert rid in h.b.unresolved_requests
            await h.call(recovered, "recover", {"operation": "operation_status", "request_id": rid})
            assert h.mcp.calls[-1]["operation"] == "operation_status"
            assert h.mcp.calls[-1]["request_id"] == rid
            assert rid not in recovered.unresolved_requests
        assert sum(p["operation"] == "control" for p in h.mcp.calls) == 1
        assert not any(p["operation"] == "read" for p in h.mcp.calls)
    asyncio.run(scenario())


def test_live_session_receives_light_schema_and_fixed_instructions(light_host):
    h = light_host
    async def scenario():
        events = []
        async def send(event, match):
            events.append(copy.deepcopy(event))
        h.b.send = send
        await h.b.configure(True, create_response=False)
        session = events[0]["session"]
        tool = next(t for t in session["tools"] if t["name"] == "smart_technologie")
        assert tool == SMART_TOOL and SMART_INSTRUCTIONS in session["instructions"]
        properties = tool["parameters"]["properties"]
        assert "legacy only, AI must never use it" in properties["action"]["description"]
        assert "current describe" in properties["parameters"]["description"]
        assert "additionalProperties" not in properties["parameters"]
    asyncio.run(scenario())
