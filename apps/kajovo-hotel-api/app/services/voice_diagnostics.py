"""Hotel infrastructure adapter for portable diagnostic storage.

No content is emitted to logging/audit. A bounded worker keeps disk IO outside
Realtime processing. Collection failures never terminate a voice connection.
"""
import asyncio
import json
import time
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from dagmar_server.diagnostic_contract import Event, metadata, redact, uid, utc
from dagmar_server.diagnostics import DiagnosticError, Diagnostics
from fastapi import HTTPException, Request

from app.config import get_settings
from app.security import auth as host_auth


@lru_cache(maxsize=1)
def store():
    config = get_settings()
    if not config.voice_diagnostic_root:
        raise HTTPException(503, detail={"code": "diagnostics_unavailable"})
    key = ""
    if config.voice_diagnostic_key_file:
        try:
            key = Path(config.voice_diagnostic_key_file).read_text().strip()
        except OSError:
            pass
    return Diagnostics(config.voice_diagnostic_root, key, release=config.voice_release_sha)


def authorize(request: Request):
    # Streaming export and chunk completion must revalidate current revocation;
    # require_session caches within one HTTP request, so use the live host loader.
    with host_auth.SessionLocal() as db:
        session = host_auth._load_session(request, db)
    if not session:
        raise HTTPException(401, detail={"code":"unauthorized"})
    if session.get("actor_type") != "admin" or session.get("role") != "admin":
        raise HTTPException(403, detail={"code": "voice_permission_required"})
    return str(session["session_id"])


class Collector:
    def __init__(self, call_id, owner, connection_id, model, provider_call_id=None):
        self.call_id, self.owner, self.connection_id, self.model = call_id, owner, connection_id, model
        self.provider_call_id = provider_call_id
        self.queue = asyncio.Queue(maxsize=128)
        self.sequence = 0
        self.dropped = 0
        self.task = None
        self.failure = None
        self.content_ids = set()
        self.segment = None

    def start(self):
        if not self.task:
            self.task = asyncio.create_task(self.run())

    def emit(self, event, *, direction="received"):
        self.sequence += 1
        value = {"schema_version": 1, "event_id": uid(), "source": "server", "sequence": self.sequence,
                 "timestamp": utc(), "monotonic_ms": time.monotonic() * 1000,
                 "event_type": "provider." + direction + "." + str(event.get("type", "unknown")),
                 "connection_id": self.connection_id,
                 "provider_call_id": self.provider_call_id,
                 "provider_event_id": event.get("event_id"),
                 "response_id": event.get("response_id") or event.get("response", {}).get("id"),
                 "item_id": event.get("item_id") or event.get("item", {}).get("id"),
                 "request_id":event.get("request_id"),
                 "remote_request_id":event.get("remote_request_id"),
                 "function_id": event.get("call_id") or event.get("item", {}).get("call_id"),
                 "attributes": metadata({"model": self.model, "status": event.get("response", {}).get("status"), "dropped_bytes": self.dropped, "duration_ms": event.get("duration_ms"), "http_status": event.get("http_status"), "phase":event.get("phase"), "exception_class":event.get("exception_class"), "locations":event.get("locations"), "count":event.get("count"), "code":event.get("code") or event.get("error",{}).get("code")})}
        # Content candidate is transient and bounded. Worker applies active segment and origin fencing.
        content = None
        if event.get("type") in {"response.done", "conversation.item.input_audio_transcription.completed", "response.output_audio_transcript.done", "conversation.item.create", "mcp.request.start", "mcp.request.result"}:
            content = event
        try:
            self.queue.put_nowait((value, content, ({**event.get("response",{}), "_model":event.get("model",self.model)} if event.get("type") in {"response.done", "curator.done"} else ({"id":"transcription_"+str(event.get("item_id")), "status":"completed", "usage":event.get("usage"), "_model":"input-transcription-unreported"} if event.get("type")=="conversation.item.input_audio_transcription.completed" else None))))
        except asyncio.QueueFull:
            self.dropped += len(__import__("json").dumps(value))

    async def run(self):
        while True:
            item = await self.queue.get()
            try:
                if item is None:
                    return
                value, content, response = item
                diagnostic = store()
                await asyncio.to_thread(diagnostic.event, self.call_id, self.owner, Event.model_validate(value))
                if response:
                    await asyncio.to_thread(diagnostic.record_usage, self.call_id, self.owner, response, response.get("_model",self.model))
                await asyncio.to_thread(self.content, diagnostic, value, content)
            except (Exception, asyncio.CancelledError) as exc:
                self.failure = exc.code if isinstance(exc, DiagnosticError) else "diagnostic_collection_failed"
                if isinstance(exc, asyncio.CancelledError):
                    raise
            finally:
                self.queue.task_done()

    def content(self, diagnostic, value, content):
        with diagnostic.lock(), diagnostic.db() as db:
            segment = db.execute("SELECT * FROM segments WHERE call_id=? AND state='recording' ORDER BY generation DESC LIMIT 1", (self.call_id,)).fetchone()
            if not segment:
                self.segment = None
                self.content_ids.clear()
                return
            if self.segment != segment["id"]:
                self.segment = segment["id"]
                self.content_ids.clear()
            segment = dict(segment)
        if datetime.fromisoformat(value["timestamp"]) < datetime.fromisoformat(segment["started"]):
            return
        typ = value["event_type"].split(".", 2)[-1]
        identities = {value.get("response_id"), value.get("item_id"), value.get("function_id"), value.get("request_id")} - {None}
        if typ in {"response.created", "input_audio_buffer.speech_started", "mcp.request.start"}:
            if len(self.content_ids) + len(identities) > 1024:
                self.failure = "content_identity_limit"
                return
            self.content_ids.update(identities)
            if content is None:
                return
        if content is None or not identities.intersection(self.content_ids):
            return
        if typ == "response.done":
            for item in content.get("response", {}).get("output", []):
                if item.get("call_id"):
                    self.content_ids.add(item["call_id"])
        elapsed = max(0, (datetime.fromisoformat(value["timestamp"]) - datetime.fromisoformat(segment["started"])).total_seconds()*1000)
        capture = segment["capture_start"] + elapsed
        if len(__import__("json").dumps(content)) > 100_000:
            return
        content_value = dict(value)
        content_value.update(event_id=value["event_id"] + "_debug", segment_id=segment["id"], generation=segment["generation"], content={"boundary_partial": True, "provider": content})
        content_value["attributes"] = {"capture_start_ms": capture, "capture_end_ms": capture, "boundary_partial": True}
        diagnostic.write(self.call_id, self.owner, value["event_id"] + "_content", "text", "content", json.dumps(redact(content_value), ensure_ascii=False).encode(), segment_id=segment["id"], generation=segment["generation"], capture_start=capture, capture_end=capture, connection_id=self.connection_id)

    async def close(self):
        if not self.task:
            return
        try:
            await asyncio.wait_for(self.queue.join(), 2)
        except TimeoutError:
            self.failure = "diagnostic_flush_incomplete"
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)
