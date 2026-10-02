import asyncio
import base64
import copy
import json

import pytest
from mcp.types import CallToolResult, ImageContent, TextContent
from voice_core_server import VoiceCoreConfig

from app.services import voice_smart
from app.services.smart_technologies import (
    validate_public,
    SmartArguments,
    SmartError,
    decode_result,
    request_id,
)

from .test_voice_core import voice_host as _voice_host

voice_host = _voice_host


def catalog(revision="r1"):
    fields = [
        {"key": key, "label": key}
        for key in [
            "name",
            "location",
            "kind",
            "controls",
            "readings",
            "current_state",
            "possible_states",
            "availability",
        ]
    ]
    fields[3].update(
        parameter_definitions={
            "p": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "brightness_percent": {"type": "number", "minimum": 0, "maximum": 100}
                },
            }
        },
        component_names={"l": "Light"},
        action_names={"a": "Set"},
        label_separator=": ",
    )
    fields[4]["reading_names"] = {"r": "State"}
    fields[6]["state_definitions"] = {"s": ["on", "off"]}
    for index, layout in {
        3: [
            "function",
            "component_ref",
            "action_ref",
            "parameters_ref",
            "supported",
            "unavailable_reason",
        ],
        4: ["function", "component_ref", "reading_ref", "unit"],
        5: ["function", "value"],
        6: ["component_ref", "states_ref"],
    }.items():
        fields[index]["item_fields"] = layout
    devices = [
        [
            "Same name",
            location,
            "light",
            [["c1", "l", "a", "p", True, ""]],
            [["r1", "l", "r", ""]],
            [["r1", "off"]],
            [["l", "s"]],
            availability,
        ]
        for location, availability in [("Reception", True), ("Hall", False)]
    ]
    return {
        "catalog_revision": revision,
        "observed_at": "2026-10-02T12:00:00Z",
        "fields": fields,
        "devices": devices,
        "results": [],
        "rows": [8, 43],
    }


@pytest.mark.parametrize("body", [
    {"operation": "read", "catalog_revision": "r1", "rows": [0]},
    {"operation": "read", "catalog_revision": "r1", "rows": [True]},
    {"operation": "read", "catalog_revision": "r1", "rows": [1, 1]},
    {"operation": "catalog", "rows": [1]},
    {"operation": "camera_view"},
    {"operation": "unknown"},
    {"operation": "catalog", "api_version": 2},
    {"operation": "search", "session_id": "model-controlled"},
    {"operation": "search", "filters": {"capabilities": ["imaginary"]}},
    {"operation": "control", "selection_id": "s", "rows": [8], "action": "vypnout"},
    {"operation": "control", "selection_id": "s", "action": "nastavit"},
    {"operation": "describe", "selection_id": "s", "limit": 9},
    {"operation": "camera_view", "catalog_revision": "r1", "rows": [8, 43]},
])
def test_operation_shape_is_strict(body):
    with pytest.raises(ValueError):
        SmartArguments.model_validate(body)


def test_v2_supports_search_selection_and_global_partial_rows():
    SmartArguments.model_validate({"operation": "search", "filters": {"capabilities": ["barva"]}, "limit": 200, "offset": 20})
    SmartArguments.model_validate({"operation": "control", "selection_id": "all-matches", "action": "vypnout"})
    value = catalog()
    validate_public(value)
    assert value["rows"] == [8, 43]
    for change in [lambda v: v["rows"].pop(), lambda v: v["devices"][0].pop(), lambda v: v["fields"].pop()]:
        bad = copy.deepcopy(value)
        change(bad)
        with pytest.raises(SmartError):
            validate_public(bad)


def mcp_result(value, images=None, error=False):
    return CallToolResult(
        content=[TextContent(type="text", text=json.dumps(value)), *(images or [])], isError=error
    )


def test_mcp_json_is_parsed_once_and_images_are_separate():
    image = ImageContent(
        type="image", mimeType="image/jpeg", data=base64.b64encode(b"\xff\xd8\xffcamera").decode()
    )
    value, images = decode_result(mcp_result(catalog(), [image]))
    assert images[0]["mime"] == "image/jpeg" and "data" not in value
    with pytest.raises(SmartError):
        decode_result(
            CallToolResult(
                content=[TextContent(type="text", text="{}"), TextContent(type="text", text="{}")]
            )
        )
    image.mimeType = "text/plain"
    with pytest.raises(SmartError, match="invalid_image"):
        decode_result(mcp_result(catalog(), [image]))
    assert decode_result(mcp_result(catalog(), error=True))[0]["error"] == "mcp_operation_rejected"


def bridge():
    return voice_smart.VoiceBridge(
        "owner", "rtc_test", "private-key", "private-token", VoiceCoreConfig(), "gpt-realtime-2.1"
    )


def test_realtime_writer_waits_for_acceptance_and_rejects_correlated_error():
    async def scenario():
        b = bridge()
        events = []

        class Socket:
            async def send(self, raw):
                events.append(json.loads(raw))

        b.ws = Socket()
        task = asyncio.create_task(
            b.send({"type": "session.update"}, lambda e: e["type"] == "session.updated")
        )
        await asyncio.sleep(0)
        assert not task.done()
        predicate, future = b.waiters[0]
        assert not predicate({"type": "session.created"})
        assert predicate({"type": "session.updated"})
        future.set_result({"type": "session.updated"})
        await task
        task = asyncio.create_task(b.send({"type": "session.update"}, lambda e: False))
        await asyncio.sleep(0)
        predicate, future = b.waiters[0]
        with pytest.raises(SmartError) as rejected:
            predicate({"type": "error", "error": {"event_id": events[-1]["event_id"]}})
        future.set_exception(rejected.value)
        with pytest.raises(SmartError):
            await task

    asyncio.run(scenario())


def test_context_replacement_preserves_global_rows_and_resets_stale_selection():
    async def scenario():
        b = bridge()
        events = []
        async def item(value):
            events.append(("create", copy.deepcopy(value)))
            return value["id"]
        async def delete(iid):
            events.append(("delete", iid))
        b.item, b.delete_item = item, delete
        search = {"catalog_revision": "r1", "selection": {"id": "s", "count": 199, "expires_at": "2099-01-01T00:00:00Z"}, "total": 199, "matches": [{"row": 8}], "has_more": True}
        b.last_search = {"query": "light"}
        b.unresolved_requests.add("voice-pending")
        await b.replace_context(search)
        first = b.catalog_item
        await b.replace_context(catalog())
        data = json.loads(events[-1][1]["content"][0]["text"].split("\n", 1)[1])
        assert data["unresolved_request_ids"] == ["voice-pending"]
        assert data["rows"] == [8, 43] and data["devices"] == catalog()["devices"]
        assert data["last_selection"]["count"] == 199 and data["last_search"] == {"query": "light"}
        assert events[1] == ("delete", first)
        await b.replace_context({"catalog_revision": "r2", "overview": {}, "total": 199})
        assert b.last_selection is b.last_search is b.last_target is None
        assert events[-1][1]["id"].startswith("kvha_")
    asyncio.run(scenario())


def test_durable_identity_does_not_reexecute_after_bridge_restart(voice_host, monkeypatch):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    args = {
        "operation": "control",
        "controls": [{"row": 1, "function": "c1"}],
        "catalog_revision": "r1",
    }
    rid, fresh = voice_smart.claim_operation("owner", "stable-voice", "call-1", args)
    assert fresh and rid == request_id("stable-voice", "call-1")
    assert voice_smart.claim_operation("owner", "stable-voice", "call-1", args) == (rid, False)
    assert voice_smart.claim_operation("owner", "restarted-voice", "call-1", args) == (rid, False)
    assert voice_smart.own_operation("owner", rid) and not voice_smart.own_operation("other", rid)
    with pytest.raises(SmartError):
        voice_smart.claim_operation(
            "owner", "stable-voice", "call-1", {**args, "catalog_revision": "r2"}
        )


def test_control_timeout_returns_original_identity_and_camera_is_input_image(
    voice_host, monkeypatch
):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: True)

    async def scenario():
        b = bridge()
        b.revision = "r1"
        b.catalog_ready = True
        sent = []
        calls = []

        async def item(value):
            sent.append(value)
            return str(len(sent))

        async def replace(value):
            b.revision = value["catalog_revision"]

        b.item, b.replace_context = item, replace

        class MCP:
            async def call_tool(self, name, args):
                calls.append(args)
                if args["operation"] == "control":
                    raise TimeoutError("private token")
                return mcp_result(
                    catalog(),
                    [
                        ImageContent(
                            type="image",
                            mimeType="image/jpeg",
                            data=base64.b64encode(b"\xff\xd8\xffcamera").decode(),
                        )
                    ],
                )

        b.mcp = MCP()
        await b.result(
            {
                "name": "smart_technologie",
                "call_id": "control1",
                "arguments": json.dumps(
                    {
                        "operation": "control",
                        "catalog_revision": "r1",
                        "controls": [{"row": 1, "function": "c1"}],
                    }
                ),
            }
        )
        output = json.loads(sent[-1]["output"])
        assert output["request_id"] == calls[0]["request_id"] and "private" not in json.dumps(
            output
        )
        await b.result({"name": "smart_technologie", "call_id": "control1", "arguments": json.dumps({"operation": "control", "catalog_revision": "r1", "controls": [{"row": 1, "function": "c1"}]})})
        with pytest.raises(SmartError, match="delivery_identity_conflict"):
            await b.result({"name": "smart_technologie", "call_id": "control1", "arguments": "{}"})
        assert len(calls) == 1
        assert not b.catalog_ready and b.technologies == "unavailable"
        assert output["request_id"] in b.unresolved_requests
        assert b.unresolved_items[output["request_id"]]
        # A fresh MCP connection/catalog is required before further device calls.
        b.catalog_ready = True
        await b.result(
            {
                "name": "smart_technologie",
                "call_id": "camera1",
                "arguments": json.dumps(
                    {"operation": "camera_view", "catalog_revision": "r1", "rows": [1]}
                ),
            }
        )
        assert sent[-1]["content"][0]["type"] == "input_image"
        assert "base64" not in sent[-2]["output"] and "devices" not in sent[-2]["output"]

    asyncio.run(scenario())


def test_lifecycle_endpoints_enforce_owner_admin_and_csrf(voice_host, monkeypatch):
    client, factory, login = voice_host
    b = bridge()
    voice_smart.manager.sessions[b.id] = b
    base = "/api/v1/admin/voice-core/sessions/" + b.id
    assert client.get(base).status_code == 401
    login("portal", "recepce")
    assert client.get(base).status_code == 403
    login()
    assert client.get(base).status_code == 404
    from app.security.auth import read_session_cookie

    b.owner = read_session_cookie(client.cookies.get("kajovo_session"))["session_id"]
    assert client.get(base).status_code == 200
    client.headers.pop("x-csrf-token")
    assert client.post(base + "/heartbeat").status_code == 403
    assert client.delete(base).status_code == 403
    client.headers["x-csrf-token"] = "test-csrf"
    assert client.post(base + "/heartbeat").status_code == 200
    assert client.delete(base).status_code == 200
    voice_smart.manager.sessions.clear()


def test_expired_revoked_and_idle_auth_never_allows_control(voice_host, monkeypatch):
    client, factory, login = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    login()
    from app.security.auth import read_session_cookie, revoke_session_by_id

    sid = read_session_cookie(client.cookies.get("kajovo_session"))["session_id"]
    assert voice_smart.authorized(sid)
    with factory() as db:
        revoke_session_by_id(db, sid)
    assert not voice_smart.authorized(sid)


def test_context_pressure_preserves_catalog_and_pending_items():
    async def scenario():
        b = bridge()
        b.catalog_item = "catalog"
        b.protected_items = {"catalog", "pending-call"}
        b.pressure = True
        b.dialog_items = ["catalog", "pending-call", *[f"dialog-{i}" for i in range(20)]]
        deleted = []

        async def delete(iid):
            deleted.append(iid)

        b.delete_item = delete
        await b.prune()
        assert deleted and "catalog" not in deleted and "pending-call" not in deleted
        b.pressure = True

        async def configure(enabled):
            assert enabled is False

        b.configure = configure
        await b.prune()
        assert b.renew

    asyncio.run(scenario())


def test_mcp_outage_keeps_ordinary_conversation_enabled(monkeypatch):
    from contextlib import asynccontextmanager

    async def scenario():
        b = bridge()
        configured = []

        @asynccontextmanager
        async def socket(*args, **kwargs):
            yield object()

        @asynccontextmanager
        async def unavailable(*args):
            raise SmartError("mcp_unavailable")
            yield

        async def reader():
            await asyncio.sleep(60)

        async def lease():
            return

        async def configure(enabled):
            configured.append(enabled)

        async def hangup():
            return

        monkeypatch.setattr(voice_smart, "connect", socket)
        monkeypatch.setattr(voice_smart, "mcp_connection", unavailable)
        monkeypatch.setattr(voice_smart, "authorized", lambda owner: True)
        b.read_events, b.lease, b.configure, b.hangup = reader, lease, configure, hangup
        await b.run()
        assert configured and all(enabled is False for enabled in configured)
        assert b.technologies == "unavailable" and b.ready.is_set()

    asyncio.run(scenario())


def test_failed_image_acceptance_warns_model_without_claiming_inspection(voice_host, monkeypatch):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: True)

    async def scenario():
        b = bridge()
        b.revision = "r1"
        b.catalog_ready = True
        sent = []

        class MCP:
            async def call_tool(self, name, args):
                return mcp_result(
                    {"catalog_revision": "r1", "results": [{"row": 1, "status": "observed"}]},
                    [
                        ImageContent(
                            type="image",
                            mimeType="image/jpeg",
                            data=base64.b64encode(b"\xff\xd8\xffcamera").decode(),
                        )
                    ],
                )

        async def item(value):
            if value.get("content", [{}])[0].get("type") == "input_image":
                raise SmartError("unsupported_input_image")
            sent.append(value)
            return str(len(sent))

        b.mcp, b.item = MCP(), item
        await b.result(
            {
                "name": "smart_technologie",
                "call_id": "camera",
                "arguments": json.dumps(
                    {"operation": "camera_view", "catalog_revision": "r1", "rows": [1]}
                ),
            }
        )
        assert len(sent) == 3 and "nebyl potvrzen" in sent[-1]["content"][0]["text"]

    asyncio.run(scenario())


def test_group_results_preserve_skipped_rows_and_queued_record_is_pending(voice_host, monkeypatch):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: True)

    async def scenario():
        b = bridge()
        b.revision = "r1"
        b.catalog_ready = True
        sent = []
        results = [{"row": 1, "status": "queued"}, {"row": 2, "status": "skipped_unavailable"}]

        class MCP:
            async def call_tool(self, name, args):
                return mcp_result({"catalog_revision": "r1", "results": results, "operation": {"status": "queued"}})

        async def item(value):
            sent.append(value)
            return str(len(sent))

        b.mcp, b.item = MCP(), item
        await b.result(
            {
                "name": "smart_technologie",
                "call_id": "group",
                "arguments": json.dumps(
                    {
                        "operation": "control",
                        "catalog_revision": "r1",
                        "controls": [{"row": row, "function": "c1"} for row in [1, 2]],
                    }
                ),
            }
        )
        output = json.loads(next(item["output"] for item in sent if item["type"] == "function_call_output"))
        assert output["results"] == results
        from app.db.models import VoiceSmartOperation

        with factory() as db:
            assert db.get(VoiceSmartOperation, output["request_id"]).status == "pending"

    asyncio.run(scenario())


def test_optional_nulls_do_not_invalidate_camera_arguments():
    args = SmartArguments.model_validate(
        {
            "operation": "camera_view",
            "catalog_revision": "r1",
            "rows": [1],
            "request_id": None,
            "controls": None,
        }
    )
    assert args.model_dump(exclude_none=True) == {
        "operation": "camera_view",
        "catalog_revision": "r1",
        "rows": [1],
    }


def test_rate_limit_resumes_generation_without_replaying_tools(monkeypatch):
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: True)

    async def scenario():
        b = bridge()
        b.catalog_ready = True
        b.rate_reset_at = 0
        configured, sent = [], []

        async def configure(enabled, **options):
            configured.append((enabled, options.get("create_response", True)))

        async def send(value, match):
            assert match({"type": "response.created"})
            sent.append(value)

        async def forbidden(call):
            raise AssertionError("a completed tool must never be replayed")

        b.configure, b.send, b.result = configure, send, forbidden
        await b.queue.put(None)
        worker = asyncio.create_task(b.work())
        for _ in range(10):
            await asyncio.sleep(0)
            if sent:
                break
        worker.cancel()
        await asyncio.gather(worker, return_exceptions=True)
        assert configured == [(True, False), (True, True)]
        assert sent == [{"type": "response.create"}]
        assert b.technologies == "ready"

    asyncio.run(scenario())


def test_durable_delivery_receipt_blocks_duplicate_output_after_restart(voice_host, monkeypatch):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: True)
    async def scenario():
        calls, sent = [], []
        class MCP:
            async def call_tool(self, name, payload):
                calls.append(payload)
                return mcp_result({"catalog_revision": "r1", "summary": {"accepted": 199, "unavailable": 2}, "results": []})
        async def item(value):
            sent.append(value)
            return value.get("id", "test")
        call = {"name": "smart_technologie", "call_id": "stable", "arguments": json.dumps({"operation": "control", "selection_id": "s", "action": "vypnout"})}
        for _ in range(2):
            b = bridge()
            b.catalog_ready = True
            b.mcp, b.item = MCP(), item
            await b.result(call)
        assert len(calls) == 1 and calls[0]["api_version"] == 2
        assert calls[0]["session_id"] == "session-" + bridge().id
        outputs = [i for i in sent if i["type"] == "function_call_output"]
        assert len(outputs) == 1 and json.loads(outputs[0]["output"])["summary"]["accepted"] == 199
        assert not any(p["operation"] == "read" for p in calls)
    asyncio.run(scenario())


def test_unacknowledged_output_requires_renewal_without_replay(voice_host, monkeypatch):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: True)
    async def scenario():
        calls = []
        class MCP:
            async def call_tool(self, name, payload):
                calls.append(payload)
                return mcp_result({"catalog_revision": "r1", "overview": {}, "results": []})
        async def item(value):
            if value["type"] == "function_call_output":
                raise SmartError("realtime_event_rejected")
            return value["id"]
        call = {"name": "smart_technologie", "call_id": "lost", "arguments": '{"operation":"control","selection_id":"s","action":"vypnout"}'}
        b = bridge()
        b.catalog_ready = True
        b.mcp, b.item = MCP(), item
        with pytest.raises(SmartError):
            await b.result(call)
        from app.db.models import VoiceSmartOperation
        with factory() as db:
            assert db.get(VoiceSmartOperation, calls[0]["request_id"]).status == "uncertain"
        recovered = bridge()
        await recovered.result(call)
        assert recovered.renew and not recovered.catalog_ready and len(calls) == 1
    asyncio.run(scenario())


def test_camera_history_is_bounded_and_explicit_target_survives_overview(voice_host, monkeypatch):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: True)

    async def scenario():
        b = bridge()
        b.catalog_ready = True
        b.last_selection = {"id": "old-group", "count": 20}
        events = []
        class MCP:
            async def call_tool(self, name, payload):
                image = ImageContent(type="image", mimeType="image/jpeg", data=base64.b64encode(b"\xff\xd8\xffcamera").decode())
                return mcp_result({"catalog_revision": "r1", "results": []}, [image] if payload["operation"] == "camera_view" else [])
        async def item(value):
            iid = value.get("id", "test-output")
            events.append(("create", iid))
            return iid
        async def delete(iid):
            events.append(("delete", iid))
        b.mcp, b.item, b.delete_item = MCP(), item, delete
        for cid in ("photo1", "photo2"):
            await b.result({"name": "smart_technologie", "call_id": cid, "arguments": json.dumps({"operation": "camera_view", "catalog_revision": "r1", "rows": [43]})})
            if cid == "photo1":
                first_image = b.image_items[0]
        assert len(b.image_items) == 1 and ("delete", first_image) in events
        assert events.index(("delete", first_image)) < events.index(("create", b.image_items[0]))
        await b.result({"name": "smart_technologie", "call_id": "overview", "arguments": '{"operation":"catalog"}'})
        assert b.last_target == {"rows": [43], "catalog_revision": "r1"}
        assert b.last_selection["id"] == "old-group"
    asyncio.run(scenario())
