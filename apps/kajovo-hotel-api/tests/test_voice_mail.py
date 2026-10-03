"""MAIL host acceptance at isolated provider/MCP ports; no real SMTP is used."""
import asyncio
import copy
import json
from datetime import timedelta
from types import SimpleNamespace

import pytest
from mcp.types import CallToolResult
from sqlalchemy import select
from voice_core_server import VoiceCoreConfig

from app.db.models import VoiceMailOperation
from app.services import voice_mail, voice_smart
from app.services.voice_mail_confirmation import MailConfirmation, draft_hash, script, crypt_token
from app.services.voice_mail import MailError
from app.time_utils import utc_now
from .test_voice_core import voice_host as _voice_host
from .test_voice_registry import arm, answer

voice_host = _voice_host


def draft():
    return {"draft_ref": "draft-test-ref", "draft_version": 1, "account": "reception", "from": "recepce@hotelchodovasc.cz",
        "to": ["test@example.invalid"], "cc": ["cc@example.invalid"], "bcc": ["bcc@example.invalid"], "subject": "Test zprávy",
        "text_body": "Celý text. Žádné odeslání do skutečné pošty.", "html_body": None, "reply_to": [], "origin_message_ref": None,
        "message_id": "<draft@example.invalid>", "in_reply_to": None, "references": [], "folder": "Drafts", "content_mode": "full"}


def candidate(d=None):
    d = d or draft()
    return {"send_candidate_id": "candidate-test-ref", "draft_ref": d["draft_ref"], "draft_version": d["draft_version"],
        "sender": d["from"], "to": d["to"], "cc": d["cc"], "bcc": d["bcc"], "subject": d["subject"], "body_hash": draft_hash(d),
        "expires_at": (utc_now() + timedelta(minutes=5)).isoformat(), "confirmation_token": "PRIVATE-CONFIRMATION-CANARY", "requires_confirmation": True}


def receipt():
    return {"status": "sent", "send_candidate_id": "candidate-test-ref", "account": "reception", "message_id": "<test@example.invalid>",
        "sent_at": utc_now().isoformat(), "receipt_id": "receipt-test", "accepted": ["test@example.invalid"], "rejected": [], "sent_copy_status": "pending", "confirmation_bypassed": False}


def reserve_candidate(factory):
    with factory() as db:
        db.add(VoiceMailOperation(id="prepare-operation", owner_session_id="owner", voice_session_id="voice", call_id="prepare-call",
            tool="mail_send_prepare", digest="a" * 64, state="pending"))
        db.commit()
    c = MailConfirmation("owner", "voice", factory)
    c.prepare(candidate(), draft(), "cs", "prepare-operation")
    return c


@pytest.mark.parametrize("name", list(voice_mail.TOOLS))
def test_every_installation_schema_is_valid_and_private_fields_never_reach_model(name):
    from jsonschema import Draft202012Validator
    t = voice_mail.TOOLS[name]
    Draft202012Validator.check_schema(t["inputSchema"])
    Draft202012Validator.check_schema(t["outputSchema"])
    parameters = voice_mail.model_schema(name)
    assert not voice_mail.PRIVATE_FIELDS.intersection(parameters.get("properties", {}))
    assert not voice_mail.PRIVATE_FIELDS.intersection(parameters.get("required", []))
    for field in voice_mail.PRIVATE_FIELDS:
        with pytest.raises(MailError):
            voice_mail.validate_input(name, {field: "fake"}, model=True)
    value = {"contract_version": "mail-mcp/1", "request_id": "r", "ok": False, "error": {"code": "INDEX_NOT_READY", "retryable": True, "message": "not ready"}}
    with pytest.raises(MailError, match="INDEX_NOT_READY"):
        voice_mail.decode(name, CallToolResult(content=[], structuredContent=value, isError=True))


@pytest.mark.parametrize("url", ["http://localhost/mcp", "https://127.0.0.1/mcp", voice_mail.MCP_URL + "?token=x", "https://other.example/mcp"])
def test_no_private_or_redirect_endpoint(url):
    async def check():
        with pytest.raises(MailError):
            async with voice_mail.connection(url, "token"):
                pytest.fail("must not connect")
    asyncio.run(check())


@pytest.mark.parametrize("language", ["cs", "en", "de", "sk"])
def test_full_envelope_body_bound_and_length(language):
    d = draft()
    text = script(d, language)
    for field in [d["from"], *d["to"], *d["cc"], *d["bcc"], d["subject"], d["text_body"]]:
        assert field in text
    d["text_body"] = "a" * 4500
    with pytest.raises(MailError, match="READBACK_TOO_LARGE"):
        script(d, language)


def test_candidate_receipt_is_audio_only_owner_scoped_single_use_encrypted(voice_host):
    _, factory, _ = voice_host
    c = reserve_candidate(factory)
    with factory() as db:
        row = db.get(VoiceMailOperation, c.operation_id)
        assert candidate()["confirmation_token"] not in row.encrypted_token
        assert crypt_token(row.encrypted_token, row.id, decrypt=True) == candidate()["confirmation_token"]
        with pytest.raises(Exception):
            crypt_token(row.encrypted_token, "other-identity", decrypt=True)
        with pytest.raises(MailError):
            c.reserve(db, c.plan.id, "send-1")
    assert c.event({"type": "conversation.item.created", "item": {"role": "user", "content": [{"type": "input_text", "text": "ano"}]}}) is None
    arm(c)
    answer(c)
    with factory() as db:
        assert c.reserve(db, c.plan.id, "send-1") == candidate()["confirmation_token"]
        db.commit()
    with factory() as db:
        with pytest.raises(MailError):
            c.reserve(db, c.plan.id, "send-2")
        rows = list(db.scalars(select(VoiceMailOperation)))
        assert draft()["text_body"] not in str([r.__dict__ for r in rows])
    assert "confirmation_token" not in json.dumps(c.view())


@pytest.mark.parametrize("event", [
    {"type": "input_audio_buffer.speech_started", "item_id": "interruption"},
    {"type": "output_audio_buffer.cleared", "response_id": "response-read"},
])
def test_interrupted_mail_readback_cannot_arm(voice_host, event):
    _, factory, _ = voice_host
    c = reserve_candidate(factory)
    c.begin_readback("response-read")
    c.event(event)
    answer(c)
    assert c.state != "confirmed"
    with factory() as db:
        with pytest.raises(MailError):
            c.reserve(db, c.plan.id, "send")


def test_incomplete_or_mismatching_audio_never_confirms(voice_host):
    _, factory, _ = voice_host
    c = reserve_candidate(factory)
    c.begin_readback("response-read")
    c.event({"type": "response.done", "response": {"id": "response-read", "status": "completed", "output": [{"content": [{"type": "audio", "transcript": "Ano odešli"}]}]}})
    c.event({"type": "output_audio_buffer.stopped", "response_id": "response-read"})
    answer(c)
    assert c.state != "confirmed"


def test_changed_or_expired_candidate_fails_closed(voice_host):
    _, factory, _ = voice_host
    c = reserve_candidate(factory)
    c.invalidate()
    bad = candidate()
    bad["body_hash"] = "0" * 64
    with pytest.raises(MailError, match="VERSION_CONFLICT"):
        c.prepare(bad, draft(), "cs", "prepare-operation")
    c.plan.expires_at = (utc_now() - timedelta(seconds=1)).isoformat()
    assert not c.valid()


@pytest.fixture()
def host(voice_host, monkeypatch):
    _, factory, _ = voice_host
    monkeypatch.setattr(voice_smart, "SessionLocal", factory)
    monkeypatch.setattr(voice_smart, "authorized", lambda owner: owner == "owner")
    h = voice_smart.VoiceBridge("owner", "rtc_mail_test", "secret", "ha-secret", VoiceCoreConfig(), "gpt-realtime-2.1")
    h.mail_ready, h.mail_state, h.mail_mcp = True, "ready", SimpleNamespace()
    h.mail_refs.add(draft()["draft_ref"])
    outputs, calls = [], []
    async def item(value):
        outputs.append(value)
        return "item-test"
    async def invoke(session, name, args):
        calls.append((name, copy.deepcopy(args)))
        if name == "mail_draft_get":
            return draft()
        if name == "mail_send_prepare":
            return candidate()
        if name in {"mail_send_confirmed", "mail_send_without_confirmation"}:
            return receipt()
        return {"accounts": []}
    monkeypatch.setattr(h, "item", item)
    monkeypatch.setattr(voice_mail, "invoke", invoke)
    return h, factory, calls, outputs


def call(name, args, cid):
    return {"name": name, "arguments": json.dumps(args), "call_id": cid}


def run(h, name, args, cid):
    asyncio.run(h.result(call(name, args, cid)))


def test_standard_send_no_model_consent_then_true_audio_and_duplicate(host):
    h, factory, calls, outputs = host
    run(h, "mail_send_prepare", {"draft_ref": draft()["draft_ref"], "expected_version": 1}, "prepare")
    assert candidate()["confirmation_token"] not in str(outputs)
    run(h, "mail_send_confirmed", {"send_candidate_id": candidate()["send_candidate_id"]}, "spoof")
    assert not any(n == "mail_send_confirmed" for n, a in calls)
    arm(h.mail_confirmation)
    answer(h.mail_confirmation)
    run(h, "mail_send_confirmed", {"send_candidate_id": candidate()["send_candidate_id"]}, "send")
    assert sum(n == "mail_send_confirmed" for n, a in calls) == 1
    run(h, "mail_send_confirmed", {"send_candidate_id": candidate()["send_candidate_id"]}, "send")
    assert sum(n == "mail_send_confirmed" for n, a in calls) == 1
    assert h.mail_private and h.registry.state == "idle"
    with factory() as db:
        assert db.scalar(select(VoiceMailOperation).where(VoiceMailOperation.candidate_id == candidate()["send_candidate_id"])).state == "sent"


def test_bypass_requires_next_genuine_audio_bound_to_selected_version(host):
    h, _, calls, outputs = host
    run(h, "mail_draft_get", {"draft_ref": draft()["draft_ref"]}, "get")
    args = {"draft_ref": draft()["draft_ref"], "expected_version": 1}
    run(h, "mail_send_without_confirmation", args, "fake")
    assert not any(n == "mail_send_without_confirmation" for n, a in calls)
    h.mail_event({"type": "conversation.item.input_audio_transcription.completed", "event_id": "invented", "item_id": "not-started", "transcript": "Odešli bez potvrzení"})
    assert h.mail_bypass is None
    h.mail_event({"type": "input_audio_buffer.speech_started", "item_id": "human"})
    h.mail_event({"type": "conversation.item.input_audio_transcription.completed", "event_id": "real-event", "item_id": "human", "transcript": "Odešli bez potvrzení"})
    run(h, "mail_send_without_confirmation", args, "send")
    assert sum(n == "mail_send_without_confirmation" for n, a in calls) == 1
    assert calls[-1][1]["explicit_user_bypass"] is True
    assert h.mail_bypass is None


def test_owner_reauthorization_missing_refs_and_independent_unavailable(host):
    h, _, calls, outputs = host
    h.mail_authorize = lambda: False
    run(h, "mail_accounts_list", {}, "revoked")
    assert not calls
    h.mail_authorize = lambda: True
    run(h, "mail_draft_get", {"draft_ref": "invented-ref"}, "badref")
    assert not calls
    h.mail_ready = False
    run(h, "mail_accounts_list", {}, "outage")
    assert h.technologies == "connecting" and not h.renew
    assert "MAIL_UNAVAILABLE" in str(outputs)


def test_restart_recovery_reuses_private_candidate_not_new_send(host, monkeypatch):
    h, factory, calls, outputs = host
    run(h, "mail_send_prepare", {"draft_ref": draft()["draft_ref"], "expected_version": 1}, "prepare")
    arm(h.mail_confirmation)
    answer(h.mail_confirmation)
    original = voice_mail.invoke
    async def uncertain(session, name, args):
        if name == "mail_send_confirmed":
            calls.append((name, copy.deepcopy(args)))
            raise MailError("SMTP_OUTCOME_UNKNOWN")
        return await original(session, name, args)
    monkeypatch.setattr(voice_mail, "invoke", uncertain)
    run(h, "mail_send_confirmed", {"send_candidate_id": candidate()["send_candidate_id"]}, "send")
    old = calls[-1][1]
    restarted = voice_smart.VoiceBridge("owner", "rtc_restarted", "key", "ha", VoiceCoreConfig(), "gpt-realtime-2.1")
    restarted.mail_ready, restarted.mail_mcp = True, h.mail_mcp
    restarted.item = h.item
    run(restarted, "mail_send_confirmed", {"send_candidate_id": candidate()["send_candidate_id"]}, "recover")
    assert calls[-1][1] == old
    assert restarted.mail_confirmation.plan is None
    with factory() as db:
        assert db.scalar(select(VoiceMailOperation).where(VoiceMailOperation.candidate_id == candidate()["send_candidate_id"])).state == "uncertain"


def test_bypass_uncertainty_recovers_original_key_after_restart(host, monkeypatch):
    h, factory, calls, outputs = host
    run(h, "mail_draft_get", {"draft_ref": draft()["draft_ref"]}, "get")
    h.mail_event({"type": "input_audio_buffer.speech_started", "item_id": "human"})
    h.mail_event({"type": "conversation.item.input_audio_transcription.completed", "event_id": "real-event", "item_id": "human", "transcript": "Odešli bez potvrzení"})
    original = voice_mail.invoke
    async def uncertain(session, name, args):
        if name == "mail_send_without_confirmation":
            calls.append((name, copy.deepcopy(args)))
            raise MailError("SMTP_OUTCOME_UNKNOWN")
        return await original(session, name, args)
    monkeypatch.setattr(voice_mail, "invoke", uncertain)
    args = {"draft_ref": draft()["draft_ref"], "expected_version": 1}
    run(h, "mail_send_without_confirmation", args, "send")
    old = calls[-1][1]
    restarted = voice_smart.VoiceBridge("owner", "rtc_restarted", "key", "ha", VoiceCoreConfig(), "gpt-realtime-2.1")
    restarted.mail_ready, restarted.mail_mcp = True, h.mail_mcp
    restarted.item = h.item
    run(restarted, "mail_send_without_confirmation", args, "recover")
    assert calls[-1][1] == old
    assert sum(n == "mail_send_without_confirmation" for n, a in calls) == 2
    with factory() as db:
        rows = list(db.scalars(select(VoiceMailOperation).where(VoiceMailOperation.tool == "mail_send_without_confirmation")))
        assert len(rows) == 1 and rows[0].state == "uncertain"


def test_mail_status_is_owner_scoped_admin_only_and_never_a_send_endpoint(voice_host, monkeypatch):
    client, factory, login = voice_host
    base = "/api/v1/admin/voice-core/sessions/unknown/mail-plan"
    assert client.get(base).status_code == 401
    login("portal", "recepce")
    assert client.get(base).status_code == 403
    login()
    assert client.get(base).status_code == 404
    assert client.post(base, json={"confirmed": True}).status_code == 405


def test_invalid_success_or_wrong_mcp_error_flag_fails_closed():
    value = {"contract_version": "mail-mcp/1", "request_id": "r", "ok": True, "data": {"accounts": []}}
    with pytest.raises(MailError, match="CONTRACT_MISMATCH"):
        voice_mail.decode("mail_accounts_list", CallToolResult(content=[], structuredContent=value, isError=True))
    value["data"]["confirmation_token"] = "bad"
    with pytest.raises(MailError, match="CONTRACT_MISMATCH"):
        voice_mail.decode("mail_accounts_list", CallToolResult(content=[], structuredContent=value))


def test_parallel_capability_updates_retain_both_independent_tool_sets(host, monkeypatch):
    h, _, _, _ = host
    h.catalog_ready = True
    sessions = []
    async def send(value, match):
        sessions.append(value["session"])
        await asyncio.sleep(0)
        return {"type": "session.updated"}
    monkeypatch.setattr(h, "send", send)
    async def configure():
        await asyncio.gather(h.configure(False), h.configure(True))
    asyncio.run(configure())
    for session in sessions:
        names = {t["name"] for t in session["tools"]}
        assert set(voice_mail.TOOLS) | {"smart_technologie", "assistant_memory"} <= names


def test_contract_drift_disables_only_mail_and_invalidates_memory_buffer(host, monkeypatch):
    h, _, calls, outputs = host
    resets = []
    h.memory_buffer = SimpleNamespace(enabled=True, reset=lambda **args: resets.append(args))
    async def drift(session, name, args):
        raise MailError("CONTRACT_MISMATCH")
    monkeypatch.setattr(voice_mail, "invoke", drift)
    run(h, "mail_accounts_list", {}, "drift")
    assert not h.mail_ready and h.mail_state == "unavailable"
    assert h.technologies == "connecting" and not h.renew
    assert not h.memory_buffer.enabled and resets == [{"invalidate": True}]
    assert "CONTRACT_MISMATCH" in str(outputs)


def test_unknown_send_blocks_new_candidate_for_same_draft_after_relogin(host):
    h, factory, _, _ = host
    run(h, "mail_send_prepare", {"draft_ref": draft()["draft_ref"], "expected_version": 1}, "prepare")
    with factory() as db:
        row = db.scalar(select(VoiceMailOperation).where(VoiceMailOperation.candidate_id == candidate()["send_candidate_id"]))
        row.state, row.send_request_id = "uncertain", "original-send"
        db.commit()
    new_session = voice_smart.VoiceBridge("new-auth-session", "rtc_new", "key", "ha", VoiceCoreConfig(), "gpt-realtime-2.1")
    with pytest.raises(MailError, match="SMTP_OUTCOME_UNKNOWN"):
        new_session.mail_claim("mail_send_prepare", {"draft_ref": draft()["draft_ref"], "expected_version": 1}, "new-prepare")


def test_delivery_diagnostic_contains_metadata_only_after_provider_ack(host, caplog, monkeypatch):
    import logging
    h, _, _, _ = host
    log = logging.getLogger("kajovo.voice")
    # Application logging setup may replace root handlers; isolate this assertion from test order.
    monkeypatch.setattr(log, "handlers", [caplog.handler])
    monkeypatch.setattr(log, "propagate", False)
    monkeypatch.setattr(log, "disabled", False)
    caplog.set_level("INFO", logger="kajovo.voice")
    run(h, "mail_send_prepare", {"draft_ref": draft()["draft_ref"], "expected_version": 1}, "prepare")
    events = [r for r in caplog.records if r.message == "voice.host.mail_delivery"]
    assert len(events) == 1
    assert events[0].context == {"voice_session_id": h.id, "tool": "mail_send_prepare", "ok": True}
    assert candidate()["confirmation_token"] not in caplog.text and draft()["text_body"] not in caplog.text


@pytest.mark.parametrize("mode", ["interrupted", "expired"])
def test_bypass_rechecks_human_consent_after_network_reload(host, monkeypatch, mode):
    from app.services import voice_mail_host
    h, _, calls, outputs = host
    clock = [0.0]
    monkeypatch.setattr(voice_mail_host, "time", SimpleNamespace(monotonic=lambda: clock[0]))
    run(h, "mail_draft_get", {"draft_ref": draft()["draft_ref"]}, "get")
    h.mail_event({"type": "input_audio_buffer.speech_started", "item_id": "human"})
    h.mail_event({"type": "conversation.item.input_audio_transcription.completed", "event_id": "real-event", "item_id": "human", "transcript": "Odešli bez potvrzení"})
    original = voice_mail.invoke
    async def reload(session, name, args):
        if name == "mail_draft_get":
            if mode == "interrupted":
                h.mail_event({"type": "input_audio_buffer.speech_started", "item_id": "new-human-audio"})
            else:
                clock[0] = 31.0
        return await original(session, name, args)
    monkeypatch.setattr(voice_mail, "invoke", reload)
    run(h, "mail_send_without_confirmation", {"draft_ref": draft()["draft_ref"], "expected_version": 1}, "send")
    assert not any(n == "mail_send_without_confirmation" for n, a in calls)
    assert "EXPLICIT_HUMAN_BYPASS_REQUIRED" in str(outputs)
