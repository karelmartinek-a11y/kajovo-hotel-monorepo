"""Deterministic provider covers real sideband dispatch/DB/output/continuation without paid API."""

import asyncio
import json
import uuid
from contextlib import asynccontextmanager

from sqlalchemy import select, func
from voice_core_server import VoiceCoreConfig

from app.db.models import AuthSession
from dagmar_server.models import VoiceNote, VoiceMemory, VoiceMemoryOperation
from app.services import voice_smart
from app.services.voice_memory_curator import TurnBuffer
from .test_voice_memory import host as _host, pid, curated
from .test_voice_core import voice_host as _voice_host

host = _host
voice_host = _voice_host


class FakeRealtime:
    def __init__(self, phrase, arguments, name="assistant_memory"):
        self.identity = "rtc_fake_" + uuid.uuid4().hex
        self.events = asyncio.Queue()
        self.sent = []
        self.phrase = phrase
        self.arguments = arguments
        self.name = name
        self.answers = []
        self.continuation_ids = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def __aiter__(self):
        return self

    async def __anext__(self):
        return json.dumps(await self.events.get())

    async def send(self, raw):
        event = json.loads(raw)
        self.sent.append(event)
        typ = event["type"]
        if typ == "session.update":
            await self.events.put({"type": "session.updated", "session": event["session"]})
        elif typ == "conversation.item.create":
            item = event["item"]
            await self.events.put({"type": "conversation.item.done", "item": item})
            if item.get("type") == "function_call_output":
                self.answers.append(json.loads(item["output"]))
        elif typ == "conversation.item.delete":
            await self.events.put(
                {"type": "conversation.item.deleted", "item_id": event["item_id"]}
            )
        elif typ == "response.create":
            assert self.answers, "continuation before backend function result"
            response_id = "spoken-" + uuid.uuid4().hex
            self.continuation_ids.append(response_id)
            await self.events.put({"type": "response.created","response":{"id":response_id,"metadata":event.get("response",{}).get("metadata")}})
            await self.events.put(
                {
                    "type": "response.output_audio_transcript.done",
                    "item_id": "assistant-" + response_id,
                    "response_id": response_id,
                    "transcript": "Potvrzený výsledek paměťové operace.",
                }
            )
            await self.events.put(
                {
                    "type": "response.done",
                    "response": {"id": response_id, "status": "completed", "output": []},
                }
            )

    async def user_phrase(self, call_id="call-1", status="completed"):
        await self.events.put({"type":"input_audio_buffer.speech_started","item_id":"user-"+call_id})
        await self.events.put({"type":"input_audio_buffer.committed","item_id":"user-"+call_id})
        await self.events.put({"type":"response.created","response":{"id":"response-"+call_id}})
        await self.events.put(
            {
                "type": "conversation.item.input_audio_transcription.completed",
                "item_id": "user-" + call_id,
                "transcript": self.phrase,
            }
        )
        # Fake model returns a documented completed function_call for that user's phrase.
        await self.events.put(
            {
                "type": "response.done",
                "response": {
                    "id": "response-" + call_id,
                    "status": status,
                    "output": [
                        {
                            "type": "function_call",
                            "id": "fc-" + call_id,
                            "call_id": call_id,
                            "name": self.name,
                            "arguments": json.dumps({"request": self.arguments}),
                        }
                    ],
                },
            }
        )


async def wait_for(predicate):
    async with asyncio.timeout(3):
        while not predicate():
            await asyncio.sleep(0.01)


async def bridge_for(host, monkeypatch, provider, *, token="", logical_call_id=None):
    client, factory, _ = host

    async def no_curation(*args):
        from app.services.voice_memory_curator import Curated

        return Curated(
            candidates=[], topics=[], summary="", decisions=[], open_points=[], continuation=""
        )

    monkeypatch.setattr("app.services.voice_memory_curator.extract", no_curation)
    with factory() as db:
        owner = db.scalar(select(AuthSession.session_id).order_by(AuthSession.created_at.desc()))
    bridge = voice_smart.VoiceBridge(
        owner, provider.identity, "test-key", token, VoiceCoreConfig(), "gpt-realtime-2.1"
    )
    if logical_call_id:
        from dagmar_server.models import LogicalCall
        with factory() as db:
            if not db.get(LogicalCall, logical_call_id):
                db.add(LogicalCall(id=logical_call_id, owner_session_id=owner))
                db.commit()
        bridge.logical_call_id = logical_call_id
        voice_smart.manager.attach_task(bridge, logical_call_id)
    monkeypatch.setattr(voice_smart, "connect", lambda *args, **kwargs: provider)

    async def hangup():
        pass

    monkeypatch.setattr(bridge, "hangup", hangup)
    monkeypatch.setitem(voice_smart.manager.sessions, bridge.id, bridge)
    bridge.task = asyncio.create_task(bridge.run())
    await asyncio.wait_for(bridge.ready.wait(), 3)
    await wait_for(lambda: bridge.memory_status != "connecting")
    return bridge


def test_phrase_to_function_db_confirmed_result_and_voice_continuation_without_mcp(
    host, monkeypatch
):
    client, factory, _ = host
    request = {
        "operation": "memory_remember",
        "kind": "preference",
        "subject": "Odpovědi na recepci",
        "content": "Krátké odpovědi.",
        "tags": ["recepce"],
    }
    provider = FakeRealtime("Zapamatuj si, že na recepci chci krátké odpovědi.", request)

    async def scenario():
        bridge = await bridge_for(host, monkeypatch, provider)
        assert bridge.memory_status == "ready" and bridge.technologies == "unavailable"
        await provider.user_phrase("cancelled-call", status="cancelled")
        await asyncio.sleep(0.03)
        assert not provider.answers
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(VoiceMemory).where(VoiceMemory.id != voice_smart.voice_memory.PROFILE_ID)) == 0
        await provider.user_phrase()
        await wait_for(lambda: len(provider.answers) == 1)
        await wait_for(lambda: any(e["type"] == "response.create" for e in provider.sent))
        assert provider.answers[0]["code"] == "ok"
        await provider.user_phrase()
        await asyncio.sleep(0.03)
        assert len(provider.answers) == 1
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(VoiceMemory).where(VoiceMemory.id != voice_smart.voice_memory.PROFILE_ID)) == 1
        await bridge.close()
        # A different provider session receives only a budgeted durable memory context.
        second_provider = FakeRealtime(
            "Jaké odpovědi na recepci preferuji?",
            {
                "operation": "memory_search",
                "query": "odpovědi recepce",
                "scope": "all",
                "tags": [],
                "date_from": None,
                "date_to": None,
                "limit": 8,
            },
        )
        second = await bridge_for(host, monkeypatch, second_provider)
        contexts = [
            e["item"]
            for e in second_provider.sent
            if e["type"] == "conversation.item.create" and e["item"].get("type") == "message"
        ]
        assert any("Krátké odpovědi." in json.dumps(i, ensure_ascii=False) for i in contexts)
        assert all(i["role"] == "assistant" for i in contexts)
        assert all(part["type"] == "output_text" for i in contexts for part in i["content"])
        assert second.human_turns.generation == 0
        assert not second.human_turns.intent()
        await second_provider.user_phrase("lookup")
        await wait_for(lambda: len(second_provider.answers) == 1)
        assert second_provider.answers[0]["memories"][0]["content"] == "Krátké odpovědi."
        await second.close()

    asyncio.run(scenario())


def test_forget_pauses_active_curation_until_a_fresh_session(host, monkeypatch):
    from app.api.routes.voice_memory import invalidate

    provider = FakeRealtime(
        "Zapamatuj si preference.",
        {
            "operation": "memory_remember",
            "kind": "preference",
            "subject": "Odpovědi",
            "content": "Krátce",
            "tags": [],
        },
    )

    async def scenario():
        bridge = await bridge_for(host, monkeypatch, provider)
        await provider.user_phrase()
        await wait_for(lambda: len(provider.answers) == 1)
        row = provider.answers[0]["memory"]
        provider.phrase = "Zapomeň na tuto preferenci."
        provider.arguments = {
            "operation": "memory_forget",
            "id": row["id"],
            "revision": row["revision"],
        }
        await provider.user_phrase("forget")
        await wait_for(lambda: len(provider.answers) == 2)
        assert provider.answers[1]["code"] == "ok"
        assert bridge.memory_privacy_paused and not bridge.memory_buffer.enabled
        await invalidate(bridge.memory_principal)
        assert not bridge.memory_buffer.enabled
        assert any(
            e.get("session", {}).get("audio", {}).get("input", {}).get("transcription", "absent")
            != "absent"
            for e in provider.sent
        )

        async def forbidden(*args):
            raise AssertionError("forgotten provider context must not be curated again")

        bridge.memory_buffer.extractor = forbidden
        bridge.memory_buffer.add("late-paraphrase", 0, "assistant", "Krátce")
        await bridge.memory_buffer.flush()
        assert not bridge.memory_buffer.turns
        provider.arguments = {
            "operation": "note_create",
            "title": "Po zapomenutí",
            "kind": "list",
            "items": [],
            "content": None,
        }
        provider.phrase = "Vytvoř poznámku po zapomenutí."
        await provider.user_phrase("explicit-still-works")
        await wait_for(lambda: len(provider.answers) == 3)
        assert provider.answers[2]["code"] == "ok"
        await asyncio.wait_for(bridge.close(), 10)
        with host[1]() as db:
            assert db.scalar(select(func.count()).select_from(VoiceMemory).where(VoiceMemory.id != voice_smart.voice_memory.PROFILE_ID)) == 0
        fresh = await bridge_for(host, monkeypatch, FakeRealtime("Nový rozhovor.", {}))
        assert fresh.memory_buffer.enabled and not fresh.memory_privacy_paused
        await asyncio.wait_for(fresh.close(), 10)

    asyncio.run(scenario())


def test_sensitive_subject_requires_explicit_user_request(host, monkeypatch):
    request = {
        "operation": "memory_remember",
        "kind": "fact",
        "subject": "Moje diagnóza",
        "content": "Soukromý údaj.",
        "tags": [],
    }

    async def scenario():
        implicit = FakeRealtime("Dnes jsme si povídali.", request)
        bridge = await bridge_for(host, monkeypatch, implicit)
        await implicit.user_phrase()
        await wait_for(lambda: bool(implicit.answers))
        assert implicit.answers[0]["code"] == "human_intent_required"
        await bridge.close()
        explicit = FakeRealtime("Zapamatuj si tento údaj o mé diagnóze.", request)
        bridge = await bridge_for(host, monkeypatch, explicit)
        await explicit.user_phrase()
        await wait_for(lambda: bool(explicit.answers))
        assert explicit.answers[0]["code"] == "ok"
        await bridge.close()

    asyncio.run(scenario())


def test_notes_protocol_sequence_and_retry_after_bridge_restart(host, monkeypatch):
    client, factory, _ = host
    provider = FakeRealtime(
        "Vytvoř lístek Nákup.",
        {
            "operation": "note_create",
            "title": "Nákup",
            "kind": "list",
            "items": [],
            "content": None,
        },
    )

    async def scenario():
        bridge = await bridge_for(host, monkeypatch, provider)
        await provider.user_phrase()
        await wait_for(lambda: len(provider.answers) == 1)
        row = provider.answers[-1]["note"]
        for number, (phrase, operation, extra) in enumerate(
            [
                ("Připiš žárovky.", "note_item_add", {"content": "žárovky", "position": None}),
                ("Připiš baterie.", "note_item_add", {"content": "baterie", "position": None}),
                ("Přejmenuj ho na Nákup hotel.", "note_rename", {"title": "Nákup hotel"}),
            ],
            2,
        ):
            provider.phrase = phrase
            provider.arguments = {
                "operation": operation,
                "id": row["id"],
                "revision": row["revision"],
                **extra,
            }
            await provider.user_phrase(str(number))
            await wait_for(lambda: len(provider.answers) == number)
            row = provider.answers[-1]["note"]
        provider.phrase = "Vymaž baterie."
        provider.arguments = {
            "operation": "note_item_remove",
            "id": row["id"],
            "revision": row["revision"],
            "item_id": row["items"][1]["id"],
        }
        await provider.user_phrase("5")
        await wait_for(lambda: len(provider.answers) == 5)
        row = provider.answers[-1]["note"]
        assert [i["content"] for i in row["items"]] == ["žárovky"]
        await bridge.close()
        replay = await bridge_for(host, monkeypatch, provider)
        await provider.user_phrase("5")
        await asyncio.sleep(0.05)
        assert len(provider.answers) == 5
        with factory() as db:
            assert db.scalar(select(func.count()).select_from(VoiceNote)) == 1
            assert (
                db.scalar(
                    select(func.count())
                    .select_from(VoiceMemoryOperation)
                    .where(VoiceMemoryOperation.operation != "curation")
                )
                == 5
            )
        await replay.close()

    asyncio.run(scenario())


def test_optional_mcp_setup_keeps_both_tools_and_closes_in_its_task(host, monkeypatch):
    from .test_smart_technologies import catalog, mcp_result

    tasks = []

    class Mcp:
        async def call_tool(self, name, arguments):
            assert name == "smart_technologie" and arguments["api_version"] == 2
            return mcp_result(catalog())

    @asynccontextmanager
    async def available(token):
        tasks.append(asyncio.current_task())
        try:
            yield Mcp()
        finally:
            tasks.append(asyncio.current_task())

    monkeypatch.setattr(voice_smart, "mcp_connection", available)
    provider = FakeRealtime(
        "Jaké mám lístky?",
        {
            "operation": "note_list",
            "query": "",
            "archived": False,
            "limit": 8,
            "offset": 0,
        },
    )

    async def scenario():
        bridge = await bridge_for(host, monkeypatch, provider, token="test-token")
        await wait_for(lambda: bridge.technologies == "ready")
        updates = [
            e["session"]
            for e in provider.sent
            if e["type"] == "session.update" and "tools" in e["session"]
        ]
        assert {t["name"] for t in updates[-1]["tools"]} == {
            "assistant_memory",
            "smart_technologie",
        }
        await provider.user_phrase()
        await wait_for(lambda: bool(provider.answers))
        assert provider.answers[0]["code"] == "ok"
        await asyncio.wait_for(bridge.close(), 10)
        assert len(tasks) == 2 and tasks[0] is tasks[1]

    asyncio.run(scenario())


def test_stalled_mcp_initialization_does_not_block_memory(host, monkeypatch):
    @asynccontextmanager
    async def stalled(token):
        await asyncio.Future()
        yield

    monkeypatch.setattr(voice_smart, "mcp_connection", stalled)
    provider = FakeRealtime(
        "Vytvoř lístek Nákup.",
        {
            "operation": "note_create",
            "title": "Nákup",
            "kind": "list",
            "items": [],
            "content": None,
        },
    )

    async def scenario():
        bridge = await bridge_for(host, monkeypatch, provider, token="test-token")
        assert bridge.memory_status == "ready"
        assert bridge.technologies == "connecting"
        assert bridge.public_status()["connection_state"] == "ready"
        await provider.user_phrase()
        await wait_for(lambda: bool(provider.answers))
        assert provider.answers[0]["code"] == "ok"
        await wait_for(lambda: any(e["type"] == "response.create" for e in provider.sent))
        await asyncio.wait_for(bridge.close(), 10)

    asyncio.run(scenario())


def test_mcp_outage_and_memory_outage_keep_ordinary_voice_enabled(host, monkeypatch):
    @asynccontextmanager
    async def outage(token):
        raise RuntimeError("MCP unavailable")
        yield

    monkeypatch.setattr(voice_smart, "mcp_connection", outage)
    provider = FakeRealtime(
        "Zapamatuj si preference.",
        {
            "operation": "memory_remember",
            "kind": "preference",
            "subject": "Odpovědi",
            "content": "Krátce",
            "tags": [],
        },
    )

    async def scenario():
        bridge = await bridge_for(host, monkeypatch, provider, token="test-token")
        await wait_for(lambda: bridge.technologies == "unavailable")
        assert bridge.technologies == "unavailable"
        await provider.user_phrase()
        await wait_for(lambda: len(provider.answers) == 1)
        assert provider.answers[0]["code"] == "ok"

        await wait_for(lambda: len(provider.continuation_ids) == 1
                       and provider.events.empty() and bridge.turns.active is None
                       and bridge.turns.pending is None)
        assert bridge.turns.responses[provider.continuation_ids[0]] == bridge.turns.generation

        def unavailable(*args, **kwargs):
            raise RuntimeError("DB unavailable")

        monkeypatch.setattr(voice_smart.voice_memory, "execute", unavailable)
        provider.arguments = {
            "operation": "memory_list",
            "status": "active",
            "limit": 20,
            "offset": 0,
        }
        await provider.user_phrase("outage")
        await wait_for(lambda: len(provider.answers) == 2)
        assert provider.answers[-1]["code"] == "unavailable"
        await wait_for(
            lambda: len([e for e in provider.sent if e["type"] == "response.create"]) == 2
        )
        await wait_for(lambda: provider.events.empty() and bridge.turns.active is None
                       and bridge.turns.pending is None)
        assert bridge.turns.responses[provider.continuation_ids[-1]] == bridge.turns.generation
        assert not bridge.closed and bridge.public_status()["connection_state"] == "ready"
        assert any(
            e.get("session", {})
            .get("audio", {})
            .get("input", {})
            .get("turn_detection", {})
            .get("create_response")
            is True
            for e in provider.sent
        )
        await bridge.close()

    asyncio.run(scenario())


def test_project_summary_new_session_uses_compact_memory(host, monkeypatch):
    client, factory, _ = host
    client.get("/api/v1/admin/voice-memory/settings")

    async def extractor(*args):
        return curated()

    async def scenario():
        buffer = TurnBuffer(
            pid(factory), "project-history", "key", factory=factory, extractor=extractor
        )
        buffer.add("u", 0, "user", "RAW_LONG_PROJECT_DIALOGUE:" + ("Věta o projektu X. " * 100))
        await buffer.close()
        provider = FakeRealtime(
            "Kde jsme minule skončili s projektem X?",
            {
                "operation": "memory_search",
                "query": "Projekt X",
                "scope": "summaries",
                "tags": [],
                "date_from": None,
                "date_to": None,
                "limit": 8,
            },
        )
        bridge = await bridge_for(host, monkeypatch, provider)
        await provider.user_phrase()
        await wait_for(lambda: len(provider.answers) == 1)
        result = provider.answers[-1]
        assert result["summaries"][0]["continuation"] == "Pokračovat testem projektu X."
        assert "RAW_LONG_PROJECT_DIALOGUE" not in json.dumps(provider.sent)
        await bridge.close()

    asyncio.run(scenario())


def test_all_server_close_paths_flush_summary_and_release_transient_data(host, monkeypatch):
    async def scenario():
        for mode in ["stop", "lease_timeout", "disconnect", "shutdown"]:
            provider = FakeRealtime(
                "Projekt X",
                {"operation": "memory_list", "status": "active", "limit": 8, "offset": 0},
            )
            bridge = await bridge_for(host, monkeypatch, provider)

            async def extractor(*args):
                return curated()

            bridge.memory_buffer.extractor = extractor
            bridge.memory_buffer.add(
                "user-end-" + mode, 0, "user", "Projekt X: pokračování příště."
            )
            if mode == "lease_timeout":
                bridge.last_heartbeat -= 60
                await asyncio.wait_for(bridge.task, 8)
            elif mode == "disconnect":
                bridge.ws.events.put_nowait(None)
                # Invalid/closed provider stream ends the reader; run's finally flushes the session.
                await asyncio.wait_for(bridge.task, 3)
            elif mode == "shutdown":
                manager = voice_smart.VoiceBridgeManager()
                manager.sessions[bridge.id] = bridge
                await manager.shutdown()
                assert not manager.sessions
            else:
                await bridge.close()
            assert bridge.closed and bridge.memory_buffer.closed
            assert (
                bridge.memory_buffer.turns == []
                and bridge.memory_buffer.pending == {}
                and bridge.memory_buffer.key == ""
            )
            from dagmar_server.models import VoiceConversationSummary

            with host[1]() as db:
                summary = db.scalar(
                    select(VoiceConversationSummary).where(
                        VoiceConversationSummary.session_id == bridge.id
                    )
                )
                assert summary and summary.continuation == "Pokračovat testem projektu X."

    asyncio.run(scenario())


def test_greeting_fast_lifecycle_once_and_early_human_priority(host, monkeypatch):
    from dagmar_server.models import LogicalCall
    class GreetingRealtime(FakeRealtime):
        async def send(self, raw):
            event = json.loads(raw)
            if event['type'] == 'response.create' and event.get('response', {}).get('metadata', {}).get('dagmar_greeting'):
                self.sent.append(event)
                response = {'id':'greeting-response', 'metadata':event['response']['metadata']}
                for value in ({'type':'response.created','response':response},
                              {'type':'output_audio_buffer.started','response_id':response['id']},
                              {'type':'response.done','response':{**response,'status':'completed','output':[]}},
                              {'type':'output_audio_buffer.stopped','response_id':response['id']}):
                    await self.events.put(value)
                return
            await super().send(raw)
    async def scenario():
        provider=GreetingRealtime('', {})
        bridge=await bridge_for(host,monkeypatch,provider)
        factory=host[1]
        logical='greeting-'+uuid.uuid4().hex
        with factory() as db:
            db.add(LogicalCall(id=logical,owner_session_id=bridge.owner))
            db.commit()
        bridge.logical_call_id=logical
        await bridge.greet()
        await asyncio.sleep(.02)
        await bridge.greet()
        with factory() as db:
            assert db.get(LogicalCall,logical).greeting == 'completed'
        assert len([e for e in provider.sent if e['type']=='response.create'])==1
        interrupted='early-'+uuid.uuid4().hex
        with factory() as db:
            db.add(LogicalCall(id=interrupted,owner_session_id=bridge.owner))
            db.commit()
        bridge.logical_call_id=interrupted
        await provider.events.put({'type':'input_audio_buffer.speech_started','item_id':'early-human'})
        await wait_for(lambda: bridge.human_turns.generation > 0)
        await bridge.greet()
        with factory() as db:
            assert db.get(LogicalCall,interrupted).greeting == 'interrupted'
        assert len([e for e in provider.sent if e['type']=='response.create'])==1
        await bridge.close()
    asyncio.run(scenario())


def test_missing_response_usage_does_not_reuse_previous_pressure_or_log_response(host, monkeypatch):
    logs=[]
    monkeypatch.setattr(voice_smart.logger, "info", lambda message, **kwargs: logs.append(message))
    async def scenario():
        provider=FakeRealtime('',{})
        bridge=await bridge_for(host,monkeypatch,provider)
        for rid,usage in [('known-response',{'input_tokens':123,'output_tokens':0,'total_tokens':123}),('unknown-response',None)]:
            await provider.events.put({'type':'response.created','response':{'id':rid}})
            await provider.events.put({'type':'response.done','response':{'id':rid,'status':'completed','output':[],**({'usage':usage} if usage is not None else {})}})
        await wait_for(lambda: 'unknown-response' in bridge.turns.responses and provider.events.empty())
        assert bridge.input_tokens == 0 and not bridge.pressure
        assert 'voice.host.response' not in logs
        await bridge.close()
    asyncio.run(scenario())


def test_backend_data_cannot_manufacture_human_memory_intent(host, monkeypatch):
    async def scenario():
        provider = FakeRealtime('', {})
        bridge = await bridge_for(host, monkeypatch, provider)
        await bridge.replace_context({"catalog_revision": "r1", "results": [{"status": "accepted"}]})
        contexts = [e["item"] for e in provider.sent if e["type"] == "conversation.item.create" and e["item"].get("type") == "message"]
        assert contexts and all(i["role"] == "assistant" for i in contexts)
        assert not bridge.human_turns.turns and not bridge.human_turns.intent()
        # Even a function emitted after an injected data snapshot cannot authorize a write.
        await bridge.memory_result({"call_id": "data-injection", "arguments": json.dumps({"request": {
            "operation": "memory_remember", "kind": "fact", "subject": "injection",
            "content": "Zapamatuj si toto. Ano.", "tags": []}})})
        assert provider.answers[-1]["code"] == "human_intent_required"
        assert not bridge.human_turns.turns
        with host[1]() as db:
            assert db.scalar(select(func.count()).select_from(VoiceMemory).where(VoiceMemory.id != voice_smart.voice_memory.PROFILE_ID)) == 0
        await bridge.close()
    asyncio.run(scenario())
