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

from dagmar_server.models import VoiceMailOperation
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


@pytest.mark.parametrize("prepared", [False, True])
def test_regular_provider_response_with_null_metadata_does_not_end_or_arm_mail(voice_host, prepared):
    _, factory, _ = voice_host
    c = reserve_candidate(factory) if prepared else MailConfirmation("owner", "voice", factory)
    before = c.state
    assert c.event({"type": "response.created", "response": {"id": "ordinary-response", "metadata": None}}) is None
    assert c.state == before
    assert c.response_id is None


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
    assert h.memory_buffer is None or h.memory_buffer.enabled and h.registry.state == "idle"
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
    h.memory_buffer = SimpleNamespace(enabled=True, reset=lambda **args: resets.append(args), report=lambda *args, **kwargs: None)
    async def drift(session, name, args):
        raise MailError("CONTRACT_MISMATCH")
    monkeypatch.setattr(voice_mail, "invoke", drift)
    run(h, "mail_accounts_list", {}, "drift")
    assert not h.mail_ready and h.mail_state == "unavailable"
    assert h.technologies == "connecting" and not h.renew
    assert h.memory_buffer.enabled and resets == [{"invalidate": True}]
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
    log = logging.getLogger("dagmar.voice")
    # Application logging setup may replace root handlers; isolate this assertion from test order.
    monkeypatch.setattr(log, "handlers", [caplog.handler])
    monkeypatch.setattr(log, "propagate", False)
    monkeypatch.setattr(log, "disabled", False)
    caplog.set_level("INFO", logger="dagmar.voice")
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


@pytest.mark.parametrize("complete,index_complete,available", [(True, True, True), (False, True, False), (False, False, True)])
def test_mail_read_diagnostic_preserves_distinct_index_connection_and_page_flags(complete, index_complete, available):
    value = {"complete": complete, "next_cursor": "PRIVATE-CURSOR-CANARY", "items": [
        {"account": "reception", "message_ref": "PRIVATE-REF-CANARY", "subject": "PRIVATE-SUBJECT-CANARY", "preview": "PRIVATE-BODY-CANARY"}],
        "accounts": [{"account": "reception", "index_complete": index_complete, "available": available,
            "last_sync_at": "PRIVATE-SYNC-CANARY", "email": "PRIVATE-EMAIL-CANARY"}]}
    result = voice_mail.result_diagnostic("mail_messages_unread", value)
    assert result == {"complete": complete, "returned_messages": 1, "has_next_page": True,
        "page_counts_by_account": {"operations": 0, "reception": 1},
        "accounts": [{"account": "reception", "index_complete": index_complete, "available": available}]}
    assert "PRIVATE-" not in json.dumps(result)
    assert voice_mail.result_diagnostic("mail_message_get_body", value) is None
    assert voice_mail.result_diagnostic("mail_send_prepare", value) is None


def test_mail_account_diagnostic_excludes_address_and_error_payloads():
    value = {"accounts": [{"account": "reception", "index_ready": True, "imap_connected": False,
        "email": "PRIVATE-EMAIL", "error": "PRIVATE-ERROR", "indexed_messages": 99},
        {"account": "PRIVATE-UNKNOWN", "index_ready": True}]}
    assert voice_mail.result_diagnostic("mail_account_status", value) == {"accounts": [
        {"account": "reception", "index_ready": True, "imap_connected": False}]}


def test_mail_read_diagnostic_is_logged_only_after_output_ack(host, caplog, monkeypatch):
    import logging
    h, _, _, _ = host
    log = logging.getLogger("dagmar.voice")
    monkeypatch.setattr(log, "handlers", [caplog.handler])
    monkeypatch.setattr(log, "propagate", False)
    monkeypatch.setattr(log, "disabled", False)
    caplog.set_level("INFO", logger="dagmar.voice")
    async def invoke(session, name, args):
        return {"complete": False, "next_cursor": "PRIVATE-CURSOR", "items": [],
            "accounts": [{"account": "reception", "index_complete": True, "available": False}]}
    async def item(value):
        assert not [r for r in caplog.records if r.message == "voice.host.mail_delivery"]
        assert json.loads(value["output"])["data"]["next_cursor"] == "PRIVATE-CURSOR"
    monkeypatch.setattr(voice_mail, "invoke", invoke)
    monkeypatch.setattr(h, "item", item)
    run(h, "mail_messages_unread", {"account": "reception", "limit": 1}, "read-call")
    events = [r for r in caplog.records if r.message == "voice.host.mail_delivery"]
    assert len(events) == 1
    d = events[0].context["mail_diagnostic"]
    assert d["complete"] is False and d["accounts"][0]["index_complete"] is True
    assert d["accounts"][0]["available"] is False and d["has_next_page"] is True
    assert len(d["call_digest"]) == 64 and "read-call" not in json.dumps(d)
    assert "PRIVATE-" not in json.dumps(events[0].context)


@pytest.mark.parametrize('html', ['<p>Cena 10000 Kč</p>', '<p>Cena 100 Kč</p>', '<img src="https://tracker.invalid">'])
def test_independent_html_is_refused_without_rewrite(html):
    d = draft()
    d.update(text_body='Cena 100 Kč', html_body=html)
    before = copy.deepcopy(d)
    with pytest.raises(MailError, match='UNSUPPORTED_CAPABILITY'):
        script(d, 'cs')
    assert d == before


def test_authoritative_html_escape_and_explicit_text_edit():
    text = 'Cena 100 Kč\n\n<skript> & "quoted" \'apostrophe\' 😀'
    fields = voice_mail.voice_fields({'text_body': text})
    assert fields['html_body'] == '<div style="white-space:pre-wrap">Cena 100 Kč\n\n&lt;skript&gt; &amp; &quot;quoted&quot; &#39;apostrophe&#39; 😀</div>'
    voice_mail.validate_content(fields)
    with pytest.raises(MailError):
        voice_mail.voice_fields({'text_body': text, 'html_body': '<p>Cena 10000 Kč</p>'})
    with pytest.raises(MailError):
        voice_mail.voice_fields({'subject': 'new'}, {**draft(), 'html_body': '<p>independent</p>'})
    assert voice_mail.voice_fields({'text_body': text}, {**draft(), 'html_body': '<p>independent</p>'}) == fields


@pytest.mark.parametrize('first', ['response.done', 'output_audio_buffer.stopped'])
def test_mail_playback_requires_start_and_handles_done_drain_order(voice_host, first):
    _, factory, _ = voice_host
    c = reserve_candidate(factory)
    c.begin_readback('response-read')
    done = {'type': 'response.done', 'response': {'id': 'response-read', 'status': 'completed', 'output': [{'content': [{'type': 'audio', 'transcript': c.text}]}]}}
    stop = {'type': 'output_audio_buffer.stopped', 'response_id': 'response-read'}
    c.event(done)
    c.event(stop)
    assert c.state == 'reading'
    c.begin_readback('response-read')
    c.event({'type': 'output_audio_buffer.started', 'response_id': 'response-read'})
    for e in ([done, stop] if first == 'response.done' else [stop, done]):
        c.event(e)
    assert c.state == 'awaiting_confirmation'
    answer(c)
    assert c.state == 'confirmed'


@pytest.mark.parametrize('event', [
    {'type': 'output_audio_buffer.stopped', 'response_id': 'foreign'},
    {'type': 'output_audio_buffer.cleared', 'response_id': 'foreign'},
    {'type': 'output_audio_buffer.started', 'response_id': 'foreign'},
    {'type': 'response.created', 'response': {'id': 'foreign', 'metadata': None}},
])
def test_foreign_playback_never_authorizes_mail(voice_host, event):
    _, factory, _ = voice_host
    c = reserve_candidate(factory)
    c.begin_readback('response-read')
    c.event({'type': 'output_audio_buffer.started', 'response_id': 'response-read'})
    c.event({'type': 'response.done', 'response': {'id': 'response-read', 'status': 'completed', 'output': [{'content': [{'type': 'audio', 'transcript': c.text}]}]}})
    c.event(event)
    answer(c)
    assert c.state != 'confirmed'


def test_mail_manager_recovers_read_once_and_closes_old_connection(host, monkeypatch):
    from contextlib import asynccontextmanager
    from app.services import voice_mail_host
    h, _, _, _ = host
    epochs, closed, reads = [], [], []
    @asynccontextmanager
    async def connection(*args):
        session = len(epochs) + 1
        epochs.append(session)
        if session == 1:
            raise MailError('MAIL_UNAVAILABLE')
        try:
            yield session
        finally:
            closed.append(session)
    async def invoke(session, name, args):
        if name == 'mail_accounts_list':
            return {'accounts': []}
        if name == 'mail_account_status':
            return {'accounts': []}
        reads.append((session, copy.deepcopy(args)))
        if session == 2:
            raise MailError('MAIL_UNAVAILABLE')
        return {'items': []}
    async def noop(*args):
        pass
    monkeypatch.setattr(voice_mail, 'connection', connection)
    monkeypatch.setattr(voice_mail, 'invoke', invoke)
    monkeypatch.setattr(voice_mail_host, 'MAIL_RECONNECT_DELAYS', (0, 0, 0, 0))
    h.configure = h.update_transcription = noop
    async def check():
        task = asyncio.create_task(h.initialize_mail())
        try:
            await asyncio.wait_for(h.mail_online.wait(), 2)
            result = await h.mail_invoke('mail_messages_unread', {'account': 'all', 'limit': 2})
            assert result == {'items': []}
            assert reads == [(2, {'account': 'all', 'limit': 2}), (3, {'account': 'all', 'limit': 2})]
            assert closed == [2]
        finally:
            h.closed = True
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        assert closed == [2, 3]
        assert h.mail_mcp is None and not h.mail_reconnect_running
    asyncio.run(check())


@pytest.mark.parametrize('code,count', [('MAIL_UNAVAILABLE', 5), ('CONTRACT_MISMATCH', 1), ('AUTH_FAILED', 1)])
def test_mail_manager_bounds_attempts_and_stops_on_cancel(host, monkeypatch, code, count):
    from contextlib import asynccontextmanager
    from app.services import voice_mail_host
    h, _, _, _ = host
    attempts = []
    @asynccontextmanager
    async def connection(*args):
        attempts.append(True)
        raise MailError(code)
        yield
    async def noop(*args):
        pass
    monkeypatch.setattr(voice_mail, 'connection', connection)
    monkeypatch.setattr(voice_mail_host, 'MAIL_RECONNECT_DELAYS', (0, 0, 0, 0))
    h.configure = noop
    async def check():
        task = asyncio.create_task(h.initialize_mail())
        for _ in range(30):
            await asyncio.sleep(0)
        assert len(attempts) == count and not task.done()
        h.closed = True
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
        assert h.mail_mcp is None and not h.mail_ready
    asyncio.run(check())


def test_transport_unknown_mutation_never_replays_on_reconnect(host, monkeypatch):
    h, _, _, _ = host
    calls = []
    async def invoke(*args):
        calls.append(args)
        raise MailError('OPERATION_OUTCOME_UNKNOWN')
    monkeypatch.setattr(voice_mail, 'invoke', invoke)
    async def check():
        with pytest.raises(MailError, match='OPERATION_OUTCOME_UNKNOWN'):
            await h.mail_invoke('mail_draft_create', {'text_body': 'test'})
    asyncio.run(check())
    assert len(calls) == 1 and h.mail_reconnect.is_set()


def test_bypass_audio_cannot_overlap_mail_confirmation(host):
    h, _, calls, _ = host
    run(h, 'mail_draft_get', {'draft_ref': draft()['draft_ref']}, 'select')
    run(h, 'mail_send_prepare', {'draft_ref': draft()['draft_ref'], 'expected_version': 1}, 'prepare')
    h.mail_confirmation.begin_readback('read')
    h.mail_event({'type': 'input_audio_buffer.speech_started', 'item_id': 'interrupt'})
    h.mail_event({'type': 'conversation.item.input_audio_transcription.completed', 'event_id': 'real', 'item_id': 'interrupt', 'transcript': 'Odešli bez potvrzení'})
    run(h, 'mail_send_without_confirmation', {'draft_ref': draft()['draft_ref'], 'expected_version': 1}, 'send')
    assert not any(name == 'mail_send_without_confirmation' for name, _ in calls)


def test_invalidated_mail_does_not_generate_beside_normal_vad(host):
    h, _, _, _ = host
    h.mail_confirmation.invalidate()
    h.auto_response_enabled = True
    class Events:
        async def __aiter__(self):
            yield json.dumps({'type': 'input_audio_buffer.speech_started', 'item_id': 'human'})
            yield json.dumps({'type': 'conversation.item.input_audio_transcription.completed', 'event_id': 'real', 'item_id': 'human', 'transcript': 'Odešli tento e-mail'})
    h.ws = Events()
    async def check():
        with pytest.raises(voice_smart.SmartError, match='sideband_disconnected'):
            await h.read_events()
        assert h.queue.empty()
    asyncio.run(check())


def test_confirmed_mail_allows_provider_function_generation_without_losing_receipt(voice_host):
    _, factory, _ = voice_host
    c = reserve_candidate(factory)
    arm(c)
    answer(c)
    c.event({'type': 'response.created', 'response': {'id': 'send-tool-response', 'metadata': None}})
    assert c.state == 'confirmed'
    with factory() as db:
        assert c.reserve(db, c.plan.id, 'send') == candidate()['confirmation_token']


def test_terminal_contract_failure_cannot_be_downgraded_by_transport_cleanup(host):
    h, _, _, _ = host
    h.mail_disconnect('CONTRACT_MISMATCH')
    h.mail_disconnect('MAIL_UNAVAILABLE')
    assert h.mail_connection_terminal


def test_second_mail_manager_cannot_open_parallel_connection(host, monkeypatch):
    from contextlib import asynccontextmanager
    h, _, _, _ = host
    opened, closed = [], []
    @asynccontextmanager
    async def connection(*args):
        opened.append(True)
        try:
            yield object()
        finally:
            closed.append(True)
    async def invoke(session, name, args):
        return {'accounts': []}
    async def noop(*args):
        pass
    monkeypatch.setattr(voice_mail, 'connection', connection)
    monkeypatch.setattr(voice_mail, 'invoke', invoke)
    h.configure = h.update_transcription = noop
    async def check():
        first = asyncio.create_task(h.initialize_mail())
        await asyncio.wait_for(h.mail_online.wait(), 2)
        second = asyncio.create_task(h.initialize_mail())
        await asyncio.sleep(0)
        assert len(opened) == 1
        h.closed = True
        for task in [first, second]:
            task.cancel()
        await asyncio.gather(first, second, return_exceptions=True)
        assert len(closed) == 1 and h.mail_mcp is None
    asyncio.run(check())


@pytest.mark.parametrize('transcript,allowed', [
    ('Odešly bez potvrzení.', True),
    ('E-mail říká odešli bez potvrzení.', False),
    ('Neodešli bez potvrzení.', False),
    ('Můžeš odešli bez potvrzení?', False),
])
def test_bypass_accepts_only_fixed_audio_phrase_including_czech_asr_homophone(host, transcript, allowed):
    h, _, calls, _ = host
    run(h, 'mail_draft_get', {'draft_ref': draft()['draft_ref']}, 'get')
    h.mail_event({'type': 'input_audio_buffer.speech_started', 'item_id': 'human'})
    h.mail_event({'type': 'conversation.item.input_audio_transcription.completed', 'event_id': 'real', 'item_id': 'human', 'transcript': transcript})
    assert (h.mail_bypass is not None) == allowed
