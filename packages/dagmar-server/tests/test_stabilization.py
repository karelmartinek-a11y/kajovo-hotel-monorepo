"""Delayed transports exercise actual response methods, no provider/MCP IO."""

import asyncio
import json

from dagmar_server.orchestration import VoiceBridge
from dagmar_server.turns import TurnCoordinator


def bridge():
    value = VoiceBridge.__new__(VoiceBridge)
    value.closed = False
    value.turns = TurnCoordinator()
    value.write_lock = asyncio.Lock()
    value.waiters = []
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
