"""Prepared argument tests against the captured public schema, without a model."""
import asyncio
import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from jsonschema.exceptions import ValidationError
from jsonschema.validators import validator_for

from app.db.models import VoiceSmartOperation
from app.services import voice_smart
from app.services.smart_technologies import decode_result, validate_public
from .test_smart_technologies import bridge, mcp_result
from .test_voice_core import voice_host as _voice_host

voice_host = _voice_host


class LightMCP:
    """Captured public describe in a network-free backend, never a runtime catalog."""
    selection_id = "hotel-compat-all"

    def __init__(self):
        snapshot = json.loads(Path(__file__).with_name("fixtures").joinpath("hotel_lights_describe.json").read_text())
        self.details = copy.deepcopy(snapshot["describe"])
        encoded = json.dumps(self.details, sort_keys=True, ensure_ascii=False).encode()
        assert hashlib.sha256(encoded).hexdigest() == snapshot["contract_sha256"]
        self.revision = self.details["catalog_revision"]
        self.calls = []
        self.status = "accepted"
        self.status_calls = []

    def schema_for(self, device, action):
        field = self.details["fields"][3]
        for function in device[3]:
            label = field["action_names"][function[2]].casefold()
            supported = function[4]
            matches = {
                "nastavit": "nastavit" in label,
                "prepnout": "přepnout" in label and "zapnutí/vypnutí" in label,
                "zapnout": "zapnout" in label,
                "vypnout": label == "vypnout",
            }
            if supported and matches[action]:
                return field["parameter_definitions"][function[3]]
        raise AssertionError("action_not_described")

    def validate_control(self, payload):
        assert payload.get("selection_id") == self.selection_id
        assert "rows" not in payload and "controls" not in payload
        parameters = payload.get("parameters") or {}
        for device in self.details["devices"]:
            schema = self.schema_for(device, payload["action"])
            validator_for(schema)(schema).validate(parameters)

    async def call_tool(self, name, payload):
        assert name == "smart_technologie" and payload["api_version"] == 2
        assert payload["session_id"].startswith("session-")
        self.calls.append(copy.deepcopy(payload))
        operation = payload["operation"]
        if operation == "search":
            assert payload["query"] == "HOTEL"
            matches = [{"row": row, "name": device[0]} for row, device in zip(self.details["rows"], self.details["devices"])]
            start, limit = payload.get("offset", 0), payload.get("limit", 200)
            return mcp_result({"catalog_revision": self.revision, "total": len(matches),
                "has_more": start + limit < len(matches),
                "selection": {"id": self.selection_id, "count": len(matches), "expires_at": "2099-01-01T00:00:00Z"},
                "matches": matches[start:start + limit]})
        if operation == "describe":
            assert payload["selection_id"] == self.selection_id
            start, limit = payload.get("offset", 0), payload.get("limit", 8)
            value = copy.deepcopy(self.details)
            value["rows"] = value["rows"][start:start + limit]
            value["devices"] = value["devices"][start:start + limit]
            return mcp_result(value)
        assert operation in {"control", "operation_status"}
        if operation == "operation_status":
            self.status_calls.append(payload["request_id"])
            status = "accepted"
        else:
            try:
                self.validate_control(payload)
            except ValidationError:
                status = "rejected"
            else:
                if self.status == "timeout":
                    raise TimeoutError("fake_only_timeout")
                status = self.status
        return mcp_result({"catalog_revision": self.revision, "summary": {status: len(self.details["rows"])},
            "results": [{"row": row, "status": status} for row in self.details["rows"]],
            "operation": {"status": status}}, error=status == "rejected")


@pytest.fixture
def host(voice_host, monkeypatch):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: owner == "owner")
    sent, mcp = [], LightMCP()
    def attach(b):
        b.revision, b.catalog_ready = mcp.revision, True
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
    ("nastavit", {"rgb": [255, 0, 0]}),
    ("nastavit", {"color": "red"}),
    ("nastavit", {"brightness_percent": 50}),
    ("nastavit", {"white_temperature_kelvin": 3000}),
    ("prepnout", None), ("zapnout", None), ("vypnout", None),
])
def test_current_contract_group_and_backend_identities(host, action, parameters):
    h = host
    async def scenario():
        await h.call(h.b, "search", {"operation": "search", "query": "HOTEL", "limit": 1})
        for offset in (0, 1):
            await h.call(h.b, f"describe-{offset}", {"operation": "describe", "selection_id": h.mcp.selection_id, "offset": offset, "limit": 1})
        args = {"operation": "control", "selection_id": h.mcp.selection_id, "action": action, "request_id": "model-must-not-own-request"}
        if parameters:
            args["parameters"] = parameters
        await h.call(h.b, "control", args)
        control = h.mcp.calls[-1]
        assert control["action"] == action and control.get("parameters") == parameters
        assert control["request_id"] == voice_smart.request_id(h.b.id, "control")
        assert all(p["session_id"] == "session-" + h.b.id for p in h.mcp.calls)
        output = json.loads(h.sent[-1]["output"])
        assert output["summary"] == {"accepted": 2}
        assert [r["row"] for r in output["results"]] == h.mcp.details["rows"]
        assert [p["operation"] for p in h.mcp.calls] == ["search", "describe", "describe", "control"]
    asyncio.run(scenario())


def test_rgb_color_is_rejected_by_current_public_schema():
    mcp = LightMCP()
    async def scenario():
        result = await mcp.call_tool("smart_technologie", {"api_version": 2, "session_id": "session-fake", "operation": "control", "selection_id": mcp.selection_id, "action": "nastavit", "parameters": {"rgb_color": [255, 0, 0]}})
        output, _ = decode_result(result)
        validate_public(output)
        assert result.isError and output["summary"] == {"rejected": 2}
    asyncio.run(scenario())


def test_group_rgb_deduplication_survives_restart(host):
    h = host
    async def scenario():
        args = {"operation": "control", "selection_id": h.mcp.selection_id, "action": "nastavit", "parameters": {"rgb": [255, 0, 0]}}
        await h.call(h.b, "stable", args)
        await h.call(h.b, "stable", args)
        await h.call(h.attach(bridge()), "stable", args)
        assert len(h.mcp.calls) == 1
        assert len([v for v in h.sent if v["type"] == "function_call_output"]) == 1
    asyncio.run(scenario())


@pytest.mark.parametrize("status", ["rejected", "uncertain", "timeout", "unsupported_parameter"])
def test_original_status_only_after_sent_failure(host, status):
    h = host
    h.mcp.status = status if status != "unsupported_parameter" else "accepted"
    async def scenario():
        parameters = {"rgb_color": [255, 0, 0]} if status == "unsupported_parameter" else {"rgb": [255, 0, 0]}
        args = {"operation": "control", "selection_id": h.mcp.selection_id, "action": "nastavit", "parameters": parameters}
        await h.call(h.b, "failure", args)
        output = json.loads(h.sent[-1]["output"])
        rid = h.mcp.calls[0]["request_id"]
        assert output["request_id"] == rid and "not_sent" not in output
        await h.call(h.b, "failure", args)
        recovered = h.attach(bridge())
        await h.call(recovered, "failure", args)
        assert len(h.mcp.calls) == 1
        with h.factory() as db:
            assert db.get(VoiceSmartOperation, rid).status == ("uncertain" if status in {"uncertain", "timeout"} else "completed")
        if status in {"uncertain", "timeout"}:
            await h.call(recovered, "recover", {"operation": "operation_status", "request_id": rid})
            assert h.mcp.calls[-1]["request_id"] == rid
        assert sum(p["operation"] == "control" for p in h.mcp.calls) == 1
        assert not any(p["operation"] == "read" for p in h.mcp.calls)
    asyncio.run(scenario())
