"""Loopback browser qualification only: synthetic SDP/audio, never a provider call."""
import asyncio
import json
import os
import ssl
from contextlib import asynccontextmanager
from uuid import uuid4

import httpx

from app.services.cml_voice_authority import CmlVoiceAuthority, ENDPOINT
from app.services.dagmar_adapter import verified_identity


class LocalVoice:
    def __init__(self, factory, key):
        if os.getenv("HOTEL_CML_UI_QUALIFICATION") != "1" or os.getenv("HOTEL_CML_UI_VOICE_LOOPBACK") != "1":
            raise RuntimeError("Explicit isolated voice qualification required")
        self.answer = None
        self.calls, self.hangups, self.authority_checks = 0, 0, 0
        self.actors = []
        # Trust exactly this test's certificate. The transport can contact only
        # loopback and replaces no URL in the production authority consumer.
        trust = ssl.create_default_context(cafile="/tmp/cml-browser-test-cert.pem")
        trust.check_hostname = False
        self.loopback = httpx.Client(verify=trust, timeout=3, trust_env=False, follow_redirects=False)

        def current(request):
            if str(request.url) != ENDPOINT:
                raise RuntimeError("Unexpected qualification authority path")
            self.authority_checks += 1
            response = self.loopback.post("https://127.0.0.1:18443/internal/web-voice-authority",
                                          content=request.content, headers={"Authorization": request.headers["authorization"],
                                                                           "Content-Type": "application/json"})
            return httpx.Response(response.status_code, content=response.content)

        self.authority = CmlVoiceAuthority(factory, lambda: key, client=httpx.Client(transport=httpx.MockTransport(current)))

    def identity(self, owner):
        return verified_identity(self.authority.identity(owner))

    def http(self, **_options):
        fixture = self

        class Provider:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                pass

            async def post(self, url, **options):
                if url == "https://api.openai.com/v1/realtime/calls":
                    if not fixture.answer:
                        raise RuntimeError("Synthetic peer answer required")
                    fixture.calls += 1
                    answer, fixture.answer = fixture.answer, None
                    assert options["files"]["sdp"][1].startswith("v=0")
                    return httpx.Response(201, text=answer, headers={"location": "https://api.openai.com/v1/realtime/calls/rtc_synthetic_" + uuid4().hex})
                if url.startswith("https://api.openai.com/v1/realtime/calls/rtc_synthetic_") and url.endswith("/hangup"):
                    fixture.hangups += 1
                    return httpx.Response(200, json={})
                raise RuntimeError("External provider request prohibited")

        return Provider()

    @asynccontextmanager
    async def socket(self, url, **_options):
        if not url.startswith("wss://api.openai.com/v1/realtime?call_id=rtc_synthetic_"):
            raise RuntimeError("External socket prohibited")

        class Socket:
            def __init__(self):
                self.events = asyncio.Queue()

            def __aiter__(self):
                return self

            async def __anext__(self):
                return json.dumps(await self.events.get())

            async def send(self, raw):
                event = json.loads(raw)
                if event["type"] == "session.update":
                    await self.events.put({"type": "session.updated", "session": event["session"]})
                elif event["type"] == "conversation.item.create":
                    await self.events.put({"type": "conversation.item.created", "item": event["item"]})
                elif event["type"] == "conversation.item.delete":
                    await self.events.put({"type": "conversation.item.deleted", "item_id": event["item_id"]})
                elif event["type"] == "response.create":
                    value = {"id": "synthetic_" + uuid4().hex, "metadata": event["response"].get("metadata", {})}
                    await self.events.put({"type": "response.created", "response": value})
                    await self.events.put({"type": "response.done", "response": {**value, "status": "completed", "output": []}})
                elif event["type"] != "response.cancel":
                    raise RuntimeError("Unexpected synthetic sideband event")

        yield Socket()

    def attach(self, app, dagmar, factory):
        from fastapi import Request
        from dagmar_server.ports import bind
        from dagmar_server.models import LogicalCall

        @app.post("/__fixture/voice-answer")
        async def answer(request: Request):
            value = await request.json()
            if set(value) != {"sdp"} or not isinstance(value["sdp"], str) or not value["sdp"].startswith("v=0") or len(value["sdp"]) > 65536:
                raise ValueError("Invalid synthetic answer")
            self.answer = value["sdp"]
            return {"ready": True}

        @app.get("/__fixture/voice-readback")
        def readback():
            with bind(dagmar.ports), factory() as db:
                calls = db.query(LogicalCall).all()
                return {"calls": [{"id": call.id, "open": call.open, "greeting": call.greeting,
                                   "namespace": (self.identity(call.owner_session_id) or {}).get("namespace")}
                                  for call in calls],
                        "sessions": [{"id": bridge.id, "closed": bridge.closed, "ready": bridge.ready.is_set()}
                                     for bridge in dagmar.manager.sessions.values()],
                        "provider_calls": self.calls, "hangups": self.hangups, "authority_checks": self.authority_checks}

        @app.post("/__fixture/voice-expire")
        def expire():
            # Advance only the synthetic native lease deadline after a lost ACK.
            # The original background loop performs revocation and hangup.
            for bridge in dagmar.manager.sessions.values():
                bridge.last_heartbeat = 0
            return {"expired": True}

        @app.on_event("shutdown")
        async def close():
            await dagmar.shutdown()
            self.authority.close()
            self.loopback.close()
