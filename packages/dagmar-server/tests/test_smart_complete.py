import asyncio
import json
from pathlib import Path

import pytest
from mcp.types import CallToolResult, TextContent
from dagmar_server.smart import SmartArguments, SMART_INSTRUCTIONS, call_smart


def result(value, error=False):
    return CallToolResult(isError=error, content=[TextContent(type="text", text=json.dumps(value))])


def page(rows, total, mode="read"):
    fields = [{"key": k} for k in ("name", "location", "kind", "controls", "readings", "current_state", "possible_states", "availability")]
    fields[3].update(component_names={"l1": "Component"}, action_names={"a1": "Action"}, parameter_definitions={"p1": {"type": "object"}})
    fields[4]["reading_names"] = {"r1": "Reading"}
    fields[6]["state_definitions"] = {"s1": {"states": ["on", "off"]}}
    if mode == "search":
        return {"catalog_revision": "rev", "results": [], "matches": [{"row": r} for r in rows], "total": total, "selection": {"id": "selection-original", "count": total}}
    return {"catalog_revision": "rev", "fields": fields, "rows": rows, "total": total,
            "devices": [[f"Device {r}", "Room", "Light", [["c1", "l1", "a1", "p1", True, ""]], [["r01", "l1", "r1", ""]], [["r01", "on"]], [["l1", "s1"]], {"available": True}] for r in rows],
            "results": [{"row": r, "status": "observed"} for r in rows], "summary": {"observed": len(rows)}}


class Client:
    def __init__(self, count, supported, mode="read"):
        self.count, self.complete_supported, self.mode = count, supported, mode
        self.calls = []

    async def call_tool(self, name, request):
        self.calls.append(dict(request))
        start = request.get("offset", 0)
        stop = min(self.count, start + request.get("limit", self.count))
        value = page(list(range(start + 1, stop + 1)), self.count, self.mode)
        value["has_more"] = stop < self.count
        return result(value)


@pytest.mark.parametrize("count", [1, 7, 8, 9, 105, 199, 1001])
@pytest.mark.parametrize("supported", [False, True])
@pytest.mark.parametrize("mode", ["read", "describe", "search"])
def test_complete_and_legacy_never_lose_targets(count, supported, mode):
    client = Client(count, supported, mode)
    reply = asyncio.run(call_smart(client, {"operation": mode, "response_mode": "complete"}))
    value = json.loads(reply.content[0].text)
    key = "matches" if mode == "search" else "devices"
    assert value["total"] == len(value[key]) == count
    assert value["has_more"] is False
    assert len(client.calls) == (1 if supported else (count + (199 if mode == "search" else 7)) // (200 if mode == "search" else 8))
    assert all(("response_mode" in c) == supported for c in client.calls)
    if mode != "search":
        for d in value["devices"]:
            assert value["fields"][3]["component_names"][d[3][0][1]] == "Component"
            assert value["fields"][4]["reading_names"][d[4][0][2]] == "Reading"
        assert value["summary"]["observed"] == count


@pytest.mark.parametrize("op", ["control", "registry_apply", "rooms_list", "operation_status"])
def test_transport_field_never_reaches_other_operations(op):
    with pytest.raises(ValueError):
        SmartArguments.model_validate({"operation": op, "response_mode": "complete"})


@pytest.mark.parametrize("key,value", [("offset", 0), ("limit", 8), ("offset", None)])
def test_complete_cannot_contain_pagination(key, value):
    with pytest.raises(ValueError):
        SmartArguments.model_validate({"operation": "search", "response_mode": "complete", key: value})


def test_mutation_not_retried_or_modified_and_terminal_status_has_no_sleep(monkeypatch):
    class Writes:
        calls = []
        async def call_tool(self, name, request):
            self.calls.append(dict(request))
            return result({"catalog_revision": "rev", "results": [], "operation": {"request_id": "original", "status": "completed"}})
    async def forbidden_sleep(delay):
        raise AssertionError("terminal status must not wait")
    monkeypatch.setattr("dagmar_server.smart.asyncio.sleep", forbidden_sleep)
    client = Writes()
    for op in ("control", "registry_apply", "operation_status"):
        request = {"operation": op, "request_id": "original"}
        asyncio.run(call_smart(client, request))
        assert client.calls[-1] == request
    assert len(client.calls) == 3


def test_poll_only_original_status_with_bounded_schedule(monkeypatch):
    delays = []
    async def sleep(delay):
        delays.append(delay)
    monkeypatch.setattr("dagmar_server.smart.asyncio.sleep", sleep)
    class Pending:
        calls = []
        async def call_tool(self, name, request):
            self.calls.append(dict(request))
            status = "running" if len(self.calls) < 5 else "completed"
            return result({"catalog_revision": "rev", "results": [], "operation": {"request_id": "original", "status": status}})
    client = Pending()
    asyncio.run(call_smart(client, {"operation": "operation_status", "request_id": "original"}))
    assert delays == [0.5, 1.0, 2.0, 2.0]
    assert all(c == {"operation": "operation_status", "request_id": "original"} for c in client.calls)


def test_shared_mandatory_instructions_and_no_old_contradictions():
    shared = json.loads((Path(__file__).parents[1] / "src/dagmar_server/smart_instructions.json").read_text())
    assert shared["guide"] in SMART_INSTRUCTIONS and shared["mandatory"] in SMART_INSTRUCTIONS
    for wrong in ("NEVER automatically read", "For full accepted success say", "Use prepnout only", "Bez automatického readbacku"):
        assert wrong not in SMART_INSTRUCTIONS


def test_pending_poll_stops_with_original_identity_before_deadline(monkeypatch):
    from types import SimpleNamespace
    elapsed = [0.0]
    monkeypatch.setattr("dagmar_server.smart.time", SimpleNamespace(monotonic=lambda: elapsed[0]))
    async def sleep(delay):
        elapsed[0] += delay
    monkeypatch.setattr("dagmar_server.smart.asyncio.sleep", sleep)
    class Pending:
        calls = []
        async def call_tool(self, name, request):
            self.calls.append(dict(request))
            return result({"catalog_revision": "rev", "results": [], "operation": {"request_id": "original", "status": "running"}})
    client = Pending()
    reply = asyncio.run(call_smart(client, {"operation": "operation_status", "request_id": "original"}))
    assert json.loads(reply.content[0].text)["operation"]["status"] == "running"
    assert elapsed[0] < 30 and len(client.calls) < 20
    assert all(c["request_id"] == "original" for c in client.calls)
