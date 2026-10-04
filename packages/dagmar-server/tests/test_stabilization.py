"""Delayed transports exercise actual response/collector methods, no provider/MCP IO."""

import asyncio
import base64
import json
import os

from dagmar_server.orchestration import VoiceBridge
from dagmar_server.turns import TurnCoordinator
from dagmar_server.collector import Collector
from dagmar_server.diagnostics import Diagnostics


def bridge():
    value = VoiceBridge.__new__(VoiceBridge)
    value.closed = False
    value.turns = TurnCoordinator()
    value.write_lock = asyncio.Lock()
    value.waiters = []
    value.diagnostics = None
    return value


def test_generation_changes_while_waiting_on_write_lock_cannot_send_stale_create():
    async def run():
        value = bridge()
        sent = []

        class Socket:
            async def send(self, raw):
                sent.append(json.loads(raw))

        value.ws = Socket()
        await value.write_lock.acquire()
        pending = asyncio.create_task(value.continue_generation(0))
        await asyncio.sleep(0)
        assert value.turns.pending
        value.turns.automatic = True
        value.turns.event(
            {"type": "input_audio_buffer.speech_started", "event_id": "speech"}
        )
        value.turns.event(
            {
                "type": "response.created",
                "event_id": "native",
                "response": {"id": "new_native"},
            }
        )
        value.write_lock.release()
        await pending
        assert sent == [] and value.turns.active == "new_native"

    asyncio.run(run())


def test_pending_intent_unique_acceptance_and_no_reader_deadlock():
    async def run():
        value = bridge()
        sent = []
        ready = asyncio.Event()

        class Socket:
            async def send(self, raw):
                sent.append(json.loads(raw))
                ready.set()

        value.ws = Socket()
        first = asyncio.create_task(
            value.send(
                {"type": "response.create"}, lambda e: e["type"] == "response.created"
            )
        )
        await ready.wait()
        assert not value.write_lock.locked()
        assert await value.send({"type": "response.create"}, lambda e: True) is None
        native = {"type": "response.created", "response": {"id": "unrelated_native"}}
        assert not value.waiters[0][0](native)
        accepted = {
            "type": "response.created",
            "response": {"id": "own", "metadata": sent[0]["response"]["metadata"]},
        }
        value.turns.event(accepted)
        match, future = value.waiters[0]
        assert match(accepted)
        future.set_result(accepted)
        assert (await first)["response"]["id"] == "own" and len(sent) == 1
        assert value.waiters == []

    asyncio.run(run())


def test_old_intent_response_never_replaces_new_generation_native_response():
    value = TurnCoordinator()
    assert value.reserve(0, "old")
    value.release("old")
    value.event({"type": "input_audio_buffer.speech_started"})
    value.event({"type": "response.created", "response": {"id": "native"}})
    value.event(
        {
            "type": "response.created",
            "response": {"id": "old", "metadata": {"dagmar_intent": "old"}},
        }
    )
    value.event(
        {"type": "response.done", "response": {"id": "old", "status": "completed"}}
    )
    assert value.active == "native" and value.responses["old"] == 0


def test_collector_ingress_epoch_and_overload_final_even_without_debug(
    tmp_path, monkeypatch
):
    from dagmar_server import collector

    diagnostic = Diagnostics(tmp_path, base64.b64encode(os.urandom(32)).decode())
    call = diagnostic.create_call("owner")["logical_call_id"]
    diagnostic.connection(call, "owner", "connection", "model", 1)
    monkeypatch.setattr(collector, "store", lambda: diagnostic)

    async def run():
        value = Collector(call, "owner", "connection", "model")
        # Queue saturation without running the writer simulates a blocked disk.
        for i in range(200):
            value.emit(
                {
                    "type": "response.done",
                    "event_id": "event_" + str(i),
                    "response": {"id": "response_" + str(i), "status": "completed"},
                }
            )
        assert value.status()["missing_events"] == 72
        value.start()
        await value.close()
        diagnostic.close(call, "owner")
        view = diagnostic.manifest(call)
        assert (
            view["call"]["producer_final"]["server_connection"]["missing_events"] == 72
        )
        assert view["call"]["incomplete"] and view["missing_final"]

    asyncio.run(run())


def test_content_queued_before_off_keeps_original_generation(tmp_path, monkeypatch):
    from dagmar_server import collector

    diagnostic = Diagnostics(tmp_path, base64.b64encode(os.urandom(32)).decode())
    call = diagnostic.create_call("owner")["logical_call_id"]
    diagnostic.connection(call, "owner", "connection", "model", 1)
    monkeypatch.setattr(collector, "store", lambda: diagnostic)

    async def run():
        value = Collector(call, "owner", "connection", "model")
        value.emit({"type": "response.created", "response": {"id": "before_on"}})
        first = diagnostic.start(call, "owner", 0)
        value.emit({"type": "response.created", "response": {"id": "original"}})
        value.emit(
            {
                "type": "response.done",
                "response": {
                    "id": "original",
                    "status": "completed",
                    "output": [{"content": [{"text": "isolated fixture"}]}],
                },
            }
        )
        diagnostic.stop(call, "owner", first["segment_id"], 5000, True)
        second = diagnostic.start(call, "owner", 10000)
        value.start()
        await value.close()
        contents = [
            r for r, _ in diagnostic.objects_for_export(call) if r["kind"] == "content"
        ]
        assert len(contents) == 1 and contents[0]["segment_id"] == first["segment_id"]
        assert contents[0]["segment_id"] != second["segment_id"]

    asyncio.run(run())


def test_commit_reordered_after_native_created_does_not_leave_phantom_pending():
    value = TurnCoordinator()
    value.automatic = True
    value.event({"type": "input_audio_buffer.speech_started"})
    assert not value.reserve(1, "too_early")
    value.event({"type": "response.created", "response": {"id": "native"}})
    value.event({"type": "input_audio_buffer.committed", "item_id": "human"})
    value.event({"type": "response.done", "response": {"id": "native"}})
    assert value.reserve(1, "tool_continuation")


def test_noise_filter_candidate_accepted_configuration_keeps_native_model_and_vad():
    from dagmar_server.ports import bind, RuntimePorts
    from dagmar_server.settings import DagmarSettings
    from voice_core_server import VoiceCoreConfig

    async def run():
        with bind(
            RuntimePorts(
                lambda: None,
                DagmarSettings(voice_input_noise_reduction="far_field"),
                lambda _: None,
            )
        ):
            value = VoiceBridge(
                "owner",
                "isolated",
                "key",
                "token",
                VoiceCoreConfig(),
                "gpt-realtime-2.1",
            )
            sent = []

            async def accepted(event, match):
                sent.append(event)
                response = {"type": "session.updated", "session": event["session"]}
                assert match(response)
                return response

            value.send = accepted
            await value.configure(False)
            setting = sent[0]["session"]["audio"]["input"]
            assert setting["noise_reduction"] == {"type": "far_field"}
            assert (
                setting["turn_detection"]["interrupt_response"]
                and setting["turn_detection"]["create_response"]
            )
            assert value.model == "gpt-realtime-2.1"

    asyncio.run(run())


def test_flush_timeout_counts_raw_aggregate_tail_and_never_reports_complete(
    tmp_path, monkeypatch
):
    import threading
    from dagmar_server import collector

    diagnostic = Diagnostics(tmp_path, base64.b64encode(os.urandom(32)).decode())
    call = diagnostic.create_call("owner")["logical_call_id"]
    diagnostic.connection(call, "owner", "connection", "model", 1)
    gate = threading.Event()
    entered = threading.Event()
    original = diagnostic.event_batch

    def slow(*args, **kwargs):
        entered.set()
        gate.wait(3)
        return original(*args, **kwargs)

    monkeypatch.setattr(collector, "store", lambda: diagnostic)
    monkeypatch.setattr(diagnostic, "event_batch", slow)

    async def run():
        value = Collector(call, "owner", "connection", "model")
        for i in range(30):
            value.emit(
                {"type": "response.output_audio.delta", "event_id": "raw_" + str(i)}
            )
        value.start()
        while not entered.is_set():
            await asyncio.sleep(0.01)
        await value.close()
        final = diagnostic.manifest(call)["call"]["producer_final"]["server_connection"]
        assert (
            not final["complete"]
            and final["missing_events"] == 30
            and final["sequence"] == 30
        )
        diagnostic.close(call, "owner")
        gate.set()

    asyncio.run(run())
