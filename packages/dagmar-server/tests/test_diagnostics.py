import base64
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import pytest
from dagmar_server.diagnostic_contract import Event, redact, LIMITS
from dagmar_server.diagnostics import Diagnostics, DiagnosticError
from dagmar_server.usage import estimate


@pytest.fixture
def store(tmp_path):
    return Diagnostics(
        tmp_path,
        base64.b64encode(os.urandom(32)).decode(),
        limits={**LIMITS, "audio": 24_576, "incident": 16_384},
        release="test-sha",
    )


def event(sequence=1, **kwargs):
    kind = kwargs.pop("event_type", "test.event")
    return Event(
        source="browser",
        sequence=sequence,
        timestamp=datetime.now(timezone.utc),
        monotonic_ms=100,
        event_type=kind,
        **kwargs,
    )


def setup(store, owner="a"):
    call = store.create_call(owner)["logical_call_id"]
    store.connection(call, owner, "connection_" + call, "model", 4)
    segment = store.start(call, owner, 10)
    return call, segment


def audio(store, call, segment, identity="chunk", payload=b"audio", end=20, owner="a"):
    return store.write(
        call,
        owner,
        identity,
        "audio",
        "audio",
        payload,
        segment_id=segment["segment_id"],
        generation=segment["generation"],
        capture_start=10,
        capture_end=end,
    )


def test_encryption_replay_conflict_and_export_integrity(store):
    call, segment = setup(store)
    first = audio(store, call, segment, payload=b"private audio canary")
    assert first["stored"]
    assert audio(store, call, segment, payload=b"private audio canary")["replayed"]
    with pytest.raises(DiagnosticError, match="identity_conflict"):
        audio(store, call, segment, payload=b"changed")
    assert all(
        b"private audio canary" not in p.read_bytes() for p in store.objects.iterdir()
    )
    rows = list(store.objects_for_export(call))
    assert rows[0][1] == b"private audio canary"
    assert store.manifest(call)["objects"][0]["checksum"] == first["checksum"]
    path = next(store.objects.iterdir())
    path.write_bytes(path.read_bytes()[:-1] + b"x")
    with pytest.raises(DiagnosticError, match="integrity_failed"):
        list(store.objects_for_export(call))


def test_generation_off_boundary_next_call_and_owner(store):
    call, segment = setup(store)
    with pytest.raises(DiagnosticError, match="call_not_found"):
        audio(store, call, segment, owner="b")
    store.stop(call, "a", segment["segment_id"], 30)
    audio(store, call, segment, end=29)
    with pytest.raises(DiagnosticError, match="boundary_invalid"):
        audio(store, call, segment, identity="late", end=31)
    store.stop(call, "a", segment["segment_id"], 300, complete=True)
    assert store.manifest(call)["segments"][0]["capture_end"] == 30
    with pytest.raises(DiagnosticError, match="generation_invalid"):
        audio(store, call, segment, identity="new_after_off")
    second = store.start(call, "a", 100)
    with pytest.raises(DiagnosticError, match="generation_invalid"):
        audio(store, call, segment, identity="old")
    store.close(call, "a")
    assert store.manifest(call)["call"]["incomplete"]
    fresh = store.create_call("a")["logical_call_id"]
    assert fresh != call and store.manifest(fresh)["segments"] == []
    assert second["generation"] > segment["generation"]


def test_quota_concurrency_closed_eviction_pin_and_open_protection(store):
    call, segment = setup(store)

    def write(index):
        try:
            return audio(
                store, call, segment, identity="chunk" + str(index), payload=b"x" * 4096
            )
        except DiagnosticError as exc:
            return exc.code

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(write, range(8)))
    assert "capacity_audio" in results
    assert store.capacity()["audio"]["used_bytes"] <= store.limits["audio"]
    assert not store.manifest(call)["call"]["deleted"]
    with pytest.raises(DiagnosticError, match="pin_requires_closed_call"):
        store.pin(call, "admin")
    store.close(call, "a")
    with pytest.raises(DiagnosticError, match="incident_full"):
        store.pin(call, "admin")
    assert not store.manifest(call)["call"]["pinned"]
    store.limits["incident"] = 50_000
    store.pin(call, "admin")
    assert store.manifest(call)["call"]["pinned"]
    assert store.capacity()["audio"]["used_bytes"] == 0
    another, new_segment = setup(store)
    audio(store, another, new_segment, identity="another", payload=b"x" * 4096)
    assert store.manifest(call)["call"]["pinned"]


def test_oldest_closed_eviction_and_crash_orphan_recovery(store):
    old, old_segment = setup(store)
    audio(store, old, old_segment, identity="old", payload=b"x" * 4096)
    store.close(old, "a")
    new, new_segment = setup(store)
    for index in range(3):
        audio(store, new, new_segment, identity="new" + str(index), payload=b"x" * 4096)
    with pytest.raises(DiagnosticError, match="call_not_found"):
        store.manifest(old)
    orphan = store.objects / "orphan"
    orphan.write_bytes(b"never committed")
    with store.db() as db:
        db.execute("INSERT INTO reservations VALUES('crashed','audio',123)")
    store.reconcile()
    assert not orphan.exists()
    with store.db() as db:
        assert db.execute("SELECT count(*) FROM reservations").fetchone()[0] == 0


def test_delete_active_fences_pending_upload_and_preserves_other_call(store):
    call, segment = setup(store)
    audio(store, call, segment)
    other, _ = setup(store)
    store.delete(call, "admin")
    with pytest.raises(DiagnosticError, match="call_not_found"):
        audio(store, call, segment, identity="pending")
    assert store.manifest(other)["call"]["id"] == other
    assert list(store.objects.iterdir()) == []


def test_gaps_duplicates_usage_missing_and_redaction(store):
    call, segment = setup(store)
    first = event(1, attributes={"model": "test", "unexpected_content": "secret"})
    store.event(call, "a", first)
    store.event(call, "a", first)
    store.event(call, "a", event(3))
    for _ in range(2):
        store.record_usage(
            call, "a", {"id": "response_a", "status": "cancelled"}, "model"
        )
    manifest = store.manifest(call)
    assert len(manifest["events"]) == 2
    assert len(manifest["gaps"]) == 1
    assert len(manifest["usage"]) == 1
    assert manifest["usage"][0]["usage"] is None
    assert "unexpected_content" not in json.dumps(manifest)
    text = redact(
        {
            "body": "ordinary email",
            "headers": {"Authorization": "Bearer canary"},
            "password": "canary",
            "url": "https://mail.invalid/download?token=canary&x=1",
            "text": "api_key=canary",
        }
    )
    assert "canary" not in json.dumps(text)
    assert text["body"] == "ordinary email"


def test_no_key_is_partial_capability_not_fake_recording(tmp_path):
    store = Diagnostics(tmp_path, "")
    call = store.create_call("a")["logical_call_id"]
    store.event(call, "a", event())
    with pytest.raises(DiagnosticError, match="key_unavailable"):
        store.start(call, "a", 0)


def test_usage_has_no_double_count_or_missing_zero():
    assert estimate(None, {})["usd"] is None
    value = {
        "input_tokens": 100,
        "output_tokens": 20,
        "total_tokens": 120,
        "input_token_details": {
            "text_tokens": 100,
            "audio_tokens": 0,
            "image_tokens": 0,
            "cached_tokens": 60,
            "cached_tokens_details": {
                "text_tokens": 60,
                "audio_tokens": 0,
                "image_tokens": 0,
            },
        },
        "output_token_details": {"text_tokens": 20, "audio_tokens": 0},
    }
    rates = {"text": {"input": 4, "cached": 0.4, "output": 24}}
    assert estimate(value, rates) == {"usd": "0.000664", "complete": True}
    value["input_token_details"].pop("cached_tokens_details")
    assert estimate(value, rates)["usd"] is None


def test_batched_audio_manifest_transaction_retry_and_crash(store, monkeypatch):
    call, segment = setup(store)
    info = {
        **segment,
        "recording_id": "recording",
        "track_id": "mic",
        "source_id": "microphone",
        "sequence": 0,
        "final": True,
        "mime": "audio/mp4",
    }
    details = dict(
        segment_id=segment["segment_id"],
        generation=segment["generation"],
        capture_start=10,
        capture_end=20,
    )
    entries = [
        dict(
            id="pair",
            category="audio",
            kind="audio",
            payload=b"container_init_and_final",
            sequence=0,
            source="microphone",
            **details,
        ),
        dict(
            id="pair_manifest",
            category="text",
            kind="audio_manifest",
            payload=json.dumps(info).encode(),
            **details,
        ),
    ]
    actual = os.fsync
    counter = 0

    def fail_second(fd):
        nonlocal counter
        counter += 1
        if counter == 2:
            raise OSError("isolated disk failure")
        return actual(fd)

    with monkeypatch.context() as patch:
        patch.setattr(os, "fsync", fail_second)
        with pytest.raises(OSError):
            store.write_many(call, "a", entries)
    assert list(store.objects_for_export(call)) == []
    assert list(store.objects.iterdir()) == []
    store.write_many(call, "a", entries)
    store.stop(call, "a", segment["segment_id"], 20, True)
    assert all(r["replayed"] for r in store.write_many(call, "a", entries))
    view = store.manifest(call)
    assert view["audio"]["unpaired_audio"] == view["audio"]["unpaired_manifests"] == 0
    assert view["audio"]["tracks"][0]["complete"]
    store.delete(call, "admin")
    assert list(store.objects.iterdir()) == []


def test_usage_missing_upgrade_and_completed_cancelled_never_double_charge(store):
    call, _ = setup(store)
    store.record_usage(call, "a", {"id": "unique", "status": "completed"}, "model")
    store.record_usage(
        call,
        "a",
        {
            "id": "unique",
            "status": "completed",
            "usage": {"input_tokens": 12, "output_tokens": 4, "total_tokens": 16},
        },
        "model",
    )
    store.record_usage(call, "a", {"id": "unique", "status": "cancelled"}, "model")
    usage = store.manifest(call)["usage"]
    assert len(usage) == 1
    assert usage[0]["usage"]["total_tokens"] == 16
    assert not usage[0]["cost_estimate"][
        "complete"
    ]  # unknown rate/modalities are not zero


def test_reservation_ingress_does_not_walk_historical_objects(store, monkeypatch):
    call, _ = setup(store)
    for i in range(30):
        store.event(call, "a", event(i + 1))
    from pathlib import Path

    monkeypatch.setattr(
        Path,
        "iterdir",
        lambda _: (_ for _ in ()).throw(
            AssertionError("historical file scan on ingress")
        ),
    )
    store.event_batch(call, "a", [event(i + 31) for i in range(30)])
    assert store.capacity()["technical"]["used_bytes"] > 0


def test_aggregated_sequence_ranges_and_producer_tail_are_explicit(store):
    call, _ = setup(store)
    store.event(call, "a", event(1, attributes={"count": 10, "sequence_end": 10}))
    store.event(call, "a", event(11))
    assert store.manifest(call)["gaps"] == []
    store.close(call, "a")
    assert store.manifest(call)["missing_final"]
    store.producer_final(
        call,
        "a",
        "browser",
        {
            "sequence": 12,
            "count": 12,
            "missing_events": 1,
            "complete": False,
            "code": "timeout",
        },
    )
    view = store.manifest(call)
    assert view["missing_final"] and view["call"]["incomplete"]


def test_legacy_unpaired_audio_retry_repairs_only_identical_pair_without_extending_off(
    store,
):
    call, segment = setup(store)
    details = dict(
        segment_id=segment["segment_id"],
        generation=segment["generation"],
        capture_start=10,
        capture_end=20,
    )
    original = dict(
        id="legacy",
        category="audio",
        kind="audio",
        payload=b"identical_old_audio",
        source="microphone",
        sequence=0,
        **details,
    )
    store.write_many(call, "a", [original])
    store.stop(call, "a", segment["segment_id"], 20, True)
    store.close(call, "a")
    info = {
        **segment,
        "source_id": "microphone",
        "track_id": "old",
        "sequence": 0,
        "mime": "audio/mp4",
        "final": True,
    }
    manifest = dict(
        id="legacy_manifest",
        category="text",
        kind="audio_manifest",
        payload=json.dumps(info).encode(),
        **details,
    )
    results = store.write_many(call, "a", [original, manifest])
    assert results[0]["replayed"] and not results[1]["replayed"]
    assert all(r["replayed"] for r in store.write_many(call, "a", [original, manifest]))
    view = store.manifest(call)
    assert view["audio"]["unpaired_audio"] == 0
    assert not view["audio"]["tracks"][0][
        "complete"
    ]  # no invented historical init/capture proof
    assert view["segments"][0]["capture_end"] == 20
    with pytest.raises(DiagnosticError, match="identity_conflict"):
        store.write_many(call, "a", [{**original, "payload": b"different"}, manifest])


def test_usage_export_numeric_counts_preserved_but_secret_tokens_redacted(store):
    usage = {
        "input_tokens": 10,
        "output_tokens": 2,
        "total_tokens": 12,
        "input_token_details": {"cached_tokens": 3, "access_token": "secret-canary"},
    }
    clean = redact(
        {
            "usage": usage,
            "confirmation_token": "secret-canary",
            "input_tokens": "secret-canary",
        }
    )
    assert (
        clean["usage"]["input_tokens"] == 10
        and clean["usage"]["input_token_details"]["cached_tokens"] == 3
    )
    assert "secret-canary" not in json.dumps(clean)
    call, _ = setup(store)
    observed = event(
        1,
        event_type="provider.response.done",
        response_id="once",
        connection_id="connection_" + call,
        attributes={"status": "completed", "usage": usage},
    )
    store.event_batch(call, "a", [observed])
    store.record_usage(
        call,
        "a",
        {
            "id": "once",
            "status": "completed",
            "usage": {"input_tokens": 11, "output_tokens": 2, "total_tokens": 13},
        },
        "model",
    )
    records = store.manifest(call)["usage"]
    assert len(records) == 1 and records[0]["usage"]["input_tokens"] == 11
    store.delete(call, "admin")
    assert list(store.objects.iterdir()) == []


def test_debug_capacity_error_does_not_discard_critical_usage(store):
    call, segment = setup(store)
    store.limits["text"] = 1
    value = event(
        1,
        event_type="provider.response.done",
        response_id="critical",
        connection_id="connection_" + call,
        segment_id=segment["segment_id"],
        generation=segment["generation"],
        attributes={
            "capture_start_ms": 10,
            "capture_end_ms": 20,
            "usage": {"input_tokens": 1, "output_tokens": 2, "total_tokens": 3},
        },
        content={"fixture": "optional content"},
    )
    result = store.event_batch(call, "a", [value])
    assert result[-1]["content_error"] == "capacity_text"
    view = store.manifest(call)
    assert len(view["events"]) == len(view["usage"]) == 1 and view["call"]["incomplete"]
