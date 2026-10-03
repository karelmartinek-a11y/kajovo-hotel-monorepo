"""Old/new MCP contract regressions at the real hotel dispatcher boundary."""
import asyncio
import json
from datetime import timedelta

import pytest
from voice_core_server import VoiceCoreConfig
from app.services import voice_smart
from app.services.smart_technologies import validate_public, SmartError, SmartArguments
from app.services.voice_registry import PublicPlan, script, registry_outcome, input_language
from app.time_utils import utc_now
from .test_voice_core import voice_host as _voice_host
from .test_smart_technologies import mcp_result

voice_host = _voice_host


def plan():
    return {"id": "p", "expires_at": (utc_now() + timedelta(minutes=5)).isoformat(), "requires_confirmation": True,
        "changes": [{"action": "delete_room", "status": "planned", "room_ref": "r", "old_name": "3. patro", "detached_devices": 2},
                    {"action": "delete_room", "status": "invalid_target", "room_ref": "missing", "detached_devices": 0}]}


def test_mixed_readback_keeps_exact_valid_changes_and_rejection_without_name():
    value = {"catalog_revision": "r1", "plan": plan()}
    validate_public(value)
    for lang in ("cs", "sk", "en", "de"):
        text = script(PublicPlan.model_validate(value["plan"]), lang)
        assert "3. patro" in text and "invalid_target" not in text and "2" in text
    for invalid in (-1, True, "2"):
        value["plan"]["changes"][0]["detached_devices"] = invalid
        with pytest.raises(SmartError):
            validate_public(value)


@pytest.mark.parametrize("status", ["unchanged", "protected_members", "invalid_target"])
@pytest.mark.parametrize("old", [True, False])
def test_nonexecuting_result_never_creates_confirmation_or_apply(voice_host, monkeypatch, old, status):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda _: True)
    async def run():
        bridge = voice_smart.VoiceBridge("owner", f"rtc-{old}-{status}", "key", "token", VoiceCoreConfig(), "gpt-realtime-2.1")
        bridge.catalog_ready = True
        changes = [{"action": "rename_room", "room_ref": "r", "status": status}]
        value = {"catalog_revision": "r1", "plan": {"id": "", "expires_at": "", "requires_confirmation": False, "changes": changes}} if old else {"catalog_revision": "r1", "results": [{"room_ref": "r", "status": status}], "summary": {status: 1}}
        if status != "unchanged":
            value["error"] = "mcp_operation_rejected"
        calls, items = [], []
        class MCP:
            async def call_tool(self, name, args):
                calls.append(args)
                return mcp_result(value)
        bridge.mcp = MCP()
        async def item(value):
            items.append(value)
            return value["id"]
        bridge.item = item
        await bridge.result({"name": "smart_technologie", "call_id": "prepare", "arguments": json.dumps({"operation": "registry_prepare", "catalog_revision": "r1", "changes": [{"action": "rename_room", "room_refs": ["r"], "new_name": "A"}]})})
        assert len(calls) == 1 and bridge.registry.plan is None and not bridge.registry.readback_pending
        output = json.loads(items[-1]["output"])
        assert output["results"][0]["status"] == status
        assert bridge.registry.state == ("unchanged" if status == "unchanged" else "rejected")
    asyncio.run(run())


@pytest.mark.parametrize("statuses,expected", [(["updated"], "applied"), (["updated", "invalid_target"], "partially_applied"), (["plan_changed"], "rejected"), (["not_sent"], "rejected"), (["unchanged"], "unchanged"), (["uncertain", "updated"], "uncertain"), (["not_found"], "uncertain"), ([], "uncertain")])
def test_results_distinguish_execution_from_transport_certainty(statuses, expected):
    assert registry_outcome({"results": [{"status": s} for s in statuses]}) == expected


def test_old_omitted_empty_selection_is_new_empty_target_not_previous_target():
    async def run():
        b = voice_smart.VoiceBridge("owner", "empty", "key", "token", VoiceCoreConfig(), "gpt-realtime-2.1")
        async def item(value):
            return value["id"]
        async def delete(value):
            pass
        b.item, b.delete_item = item, delete
        b.last_target = {"rows": [30]}
        await b.replace_context({"catalog_revision": "r1", "selection": {"id": "empty", "count": 0, "expires_at": "2099-01-01T00:00:00Z"}})
        assert b.last_target is None and b.last_selection["count"] == 0
        await b.replace_context({"catalog_revision": "r1", "room_selection": {"id": "empty-room", "count": 0, "expires_at": "2099-01-01T00:00:00Z"}})
        assert b.last_rooms == [] and b.last_room_selection["count"] == 0
    asyncio.run(run())


def test_revision_omission_is_before_write_identity_reservation():
    b = voice_smart.VoiceBridge("owner", "payload", "key", "token", VoiceCoreConfig(), "gpt-realtime-2.1")
    for operation in ("registry_apply", "rooms_list"):
        assert "catalog_revision" not in b.mcp_payload({"operation": operation, "catalog_revision": "r1"})
    args = SmartArguments.model_validate({"operation": "search", "filters": {"room_ref": "exact", "capabilities": ["barva"]}})
    assert args.filters.room_ref == "exact"


@pytest.mark.parametrize("text,language", [("Přejmenuj umístění room na Nová", "cs"), ("Přestěhuj LobbyPas do Lobby", "cs"), ("Jaké mám typy umístění", "cs"), ("Zmeň umiestnenie zariadenia room", "sk"), ("Rename room Lobby", "en")])
def test_language_uses_command_words_before_incidental_foreign_room_name(text, language):
    assert input_language(text, "de") == language


def test_readonly_reconnect_after_initial_outage_keeps_original_unresolved_ids(voice_host, monkeypatch):
    from contextlib import asynccontextmanager
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda _: True)
    async def run():
        b = voice_smart.VoiceBridge("owner", "reconnect", "key", "token", VoiceCoreConfig(), "gpt-realtime-2.1")
        b.unresolved_requests.add("original-id")
        attempts, calls = [], []
        @asynccontextmanager
        async def connection(token):
            attempts.append(True)
            if len(attempts) == 1:
                raise OSError("isolated outage")
            class MCP:
                room_ref_supported = True
                async def call_tool(self, name, args):
                    calls.append(args["operation"])
                    return mcp_result({"catalog_revision": "r1", "overview": {}, "total": 199})
            yield MCP()
        monkeypatch.setattr(voice_smart, "mcp_connection", connection)
        async def replace(value):
            assert value["exact_room_ref_supported"]
        async def configure(enabled):
            assert enabled
            b.closed = True
        b.replace_context, b.configure = replace, configure
        await b.initialize_technologies()
        assert len(attempts) == 2 and calls == ["catalog"]
        assert b.unresolved_requests == {"original-id"}
    asyncio.run(run())


def test_housekeeping_retains_even_old_completed_and_unresolved_smart_identities(voice_host, monkeypatch):
    from app.db.models import VoiceSmartOperation, VoiceSmartDelivery
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    with factory() as db:
        for status in ("pending", "uncertain", "completed"):
            db.add(VoiceSmartOperation(request_id=status, owner_session_id="owner", call_id=status, arguments_digest="digest", status=status, created_at=utc_now()-timedelta(days=90)))
            db.add(VoiceSmartDelivery(id=status, owner_session_id="owner", arguments_digest="digest", status="pending", created_at=utc_now()-timedelta(days=90)))
        db.commit()
    async def run():
        n = 0
        async def sleep(delay):
            nonlocal n
            n += 1
            if n > 1:
                raise asyncio.CancelledError()
        monkeypatch.setattr(voice_smart.asyncio, "sleep", sleep)
        with pytest.raises(asyncio.CancelledError):
            await voice_smart.VoiceBridgeManager().housekeeping()
    asyncio.run(run())
    with factory() as db:
        assert all(db.get(VoiceSmartOperation, s) and db.get(VoiceSmartDelivery, s) for s in ("pending", "uncertain", "completed"))


def test_activation_proof_contract_is_executable_without_provider_or_backend():
    from scripts.verify_voice_mcp_compatibility import verify
    assert len(verify()["checks"]) == 6 and all(verify()["checks"].values())
