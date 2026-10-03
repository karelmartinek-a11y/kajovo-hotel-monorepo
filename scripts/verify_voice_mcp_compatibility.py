"""No paid calls or production writes: execute the deployed adapter's compatibility contract."""
import hashlib
import json
from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from voice_core_server import VoiceCoreConfig

from app.db.models import Base, VoiceRegistryPlan
from app.services import voice_smart
from app.services.smart_technologies import SmartArguments, validate_public, SmartError
from app.services.voice_registry import PublicPlan, RegistryConfirmation, script, registry_outcome
from app.time_utils import utc_now


def verify():
    checks = {}
    change = {"action": "delete_room", "status": "planned", "room_ref": "room-public", "old_name": "3. patro", "detached_devices": 2}
    plan = {"id": "compat-plan", "expires_at": (utc_now()+timedelta(minutes=5)).isoformat(), "requires_confirmation": True, "changes": [change, {"action": "delete_room", "room_ref": "missing", "status": "invalid_target", "detached_devices": 0}]}
    validate_public({"catalog_revision": "r1", "plan": plan})
    for language in ("cs", "en", "de", "sk"):
        readback = script(PublicPlan.model_validate(plan), language)
        assert "3. patro" in readback and "2" in readback and "invalid_target" not in readback
    checks["detached_devices"] = checks["rejected_without_names"] = True
    for forbidden in ("area_id", "device_id"):
        invalid = {"catalog_revision": "r1", "plan": {**plan, "changes": [{**change, forbidden: "internal"}]}}
        try:
            validate_public(invalid)
        except SmartError:
            pass
        else:
            raise AssertionError("internal identity accepted")
    for status in ("unchanged", "invalid_target", "protected_members"):
        for old in (True, False):
            value = {"catalog_revision": "r1", "plan": {"id": "", "expires_at": "", "requires_confirmation": False, "changes": [{"action": "delete_room", "status": status}]}} if old else {"catalog_revision": "r1", "results": [{"status": status}], "summary": {status: 1}}
            validate_public(value)
            assert "plan" not in value and value["results"][0]["status"] == status
    checks["old_and_new_shapes"] = checks["no_plan_results"] = True
    filters = SmartArguments.model_validate({"operation": "search", "filters": {"room_ref": "exact", "capabilities": ["barva"]}}).filters
    assert filters.room_ref == "exact" and filters.capabilities == ["barva"]
    b = voice_smart.VoiceBridge("test-owner", "test-call", "not-a-key", "not-a-token", VoiceCoreConfig(), "gpt-realtime-2.1")
    for operation in ("rooms_list", "registry_apply"):
        assert "catalog_revision" not in b.mcp_payload({"operation": operation, "catalog_revision": "r1"})
    checks["exact_room_ref"] = True
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    original = voice_smart.SessionLocal
    try:
        voice_smart.SessionLocal = factory
        r = RegistryConfirmation("test-owner", "test-voice", factory)
        r.prepare(plan, "cs")
        r.begin_readback("matching-provider-response")
        r.event({"type": "response.done", "response": {"id": "matching-provider-response", "status": "completed", "output": [{"content": [{"type": "audio", "transcript": r.text}]}]}})
        r.event({"type": "output_audio_buffer.stopped", "response_id": "matching-provider-response"})
        r.event({"type": "input_audio_buffer.speech_started", "item_id": "audio-input"})
        r.event({"type": "conversation.item.input_audio_transcription.completed", "item_id": "audio-input", "event_id": "provider-input", "transcript": "ano"})
        args = {"operation": "registry_apply", "plan_id": plan["id"]}
        rid, fresh = voice_smart.claim_operation("test-owner", "test-voice", "provider-call", args, r)
        assert fresh and voice_smart.own_operation("test-owner", rid)
        voice_smart.operation_finished(rid, "uncertain", r)
        assert voice_smart.claim_operation("test-owner", "test-voice", "provider-call", args, r) == (rid, False)
        voice_smart.operation_finished(rid, "completed", r, "partially_applied")
        with factory() as db:
            assert db.get(VoiceRegistryPlan, r.identity).state == "partially_applied"
        assert registry_outcome({"results": [{"status": "not_sent"}]}) == "rejected"
        checks["original_operation_status"] = True
    finally:
        voice_smart.SessionLocal = original
        engine.dispose()
    return {"checks": checks, "isolated_runtime_contract": "PASS", "production_writes": 0,
            "contract_digest": hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()}


if __name__ == "__main__":
    print(json.dumps(verify(), sort_keys=True))
