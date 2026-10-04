"""Bounded priority ingress and batched IO. No storage lock in the Realtime loop."""

import asyncio
import hashlib
import json
import time
from datetime import datetime
from .diagnostic_contract import Event, metadata, redact, uid, utc
from .diagnostics import DiagnosticError
from .ports import runtime
from .usage import usage_record


def store():
    return runtime().application.diagnostics


class Collector:
    def __init__(self, call_id, owner, connection_id, model, provider_call_id=None):
        self.call_id, self.owner, self.connection_id, self.model = (
            call_id,
            owner,
            connection_id,
            model,
        )
        self.provider_call_id = provider_call_id
        self.queue = asyncio.Queue(maxsize=128)  # transitions/errors/operations/finales
        self.deltas = asyncio.Queue(maxsize=128)  # optional aggregate windows
        self.sequence = self.dropped = self.missing = self.stored = 0
        self.task = None
        self.failure = None
        self.content_ids = set()
        self.segment = None
        self.aggregate = None
        self.wakeup = asyncio.Event()
        self.ending = False
        self.last_lag = 0.0
        self.final_task = None
        self.maintenance = None
        self.inflight = 0

    def start(self):
        if not self.task:
            self.task = asyncio.create_task(self.run())

    def status(self):
        return {
            "complete": not bool(self.failure or self.missing),
            "code": self.failure,
            "sequence": self.sequence,
            "count": self.sequence,
            "dropped_bytes": self.dropped,
            "missing_events": self.missing,
            "pending": self.queue.qsize() + self.deltas.qsize() + self.inflight,
            "lag_ms": self.last_lag,
            "stored_count": self.stored,
        }

    def lost(self, value, code="diagnostic_backpressure"):
        self.dropped += len(json.dumps(value, default=str).encode())
        self.missing += value.get("attributes", {}).get("count") or 1
        self.failure = code

    def put(self, item, *, delta=False):
        try:
            (self.deltas if delta else self.queue).put_nowait(item)
            self.wakeup.set()
        except asyncio.QueueFull:
            self.lost(item[0])

    def flush_delta(self):
        if self.aggregate:
            value = self.aggregate
            self.aggregate = None
            self.put((value, None, None), delta=True)

    def emit(self, event, *, direction="received"):
        if self.ending:
            return
        self.sequence += 1
        response = event.get("response", {})
        value = {
            "schema_version": 1,
            "event_id": uid(),
            "source": "server",
            "sequence": self.sequence,
            "timestamp": utc(),
            "monotonic_ms": time.monotonic() * 1000,
            "event_type": "provider."
            + direction
            + "."
            + str(event.get("type", "unknown")),
            "connection_id": self.connection_id,
            "provider_call_id": self.provider_call_id,
            "provider_event_id": event.get("event_id"),
            "response_id": event.get("response_id") or response.get("id"),
            "item_id": event.get("item_id") or event.get("item", {}).get("id"),
            "request_id": event.get("request_id"),
            "remote_request_id": event.get("remote_request_id"),
            "function_id": event.get("function_id")
            or event.get("call_id")
            or event.get("item", {}).get("call_id"),
            "operation_id": event.get("operation_id"),
            "delivery_id": event.get("delivery_id"),
            "turn_id": event.get("turn_id"),
            "attributes": metadata(
                {
                    "model": self.model,
                    "intent_id": (response.get("metadata") or {}).get("dagmar_intent"),
                    "status": response.get("status"),
                    "duration_ms": event.get("duration_ms"),
                    "http_status": event.get("http_status"),
                    "phase": event.get("phase"),
                    "exception_class": event.get("exception_class"),
                    "locations": event.get("locations"),
                    "settings": event.get("settings"),
                    "reason": event.get("reason"),
                    "count": event.get("count"),
                    "code": event.get("code") or event.get("error", {}).get("code"),
                }
            ),
        }
        typ = event.get("type", "")
        if typ.endswith(".delta"):
            old = self.aggregate
            if old and (
                old["event_type"] != value["event_type"]
                or old["response_id"] != value["response_id"]
                or value["monotonic_ms"] - old["monotonic_ms"] > 250
                or old["attributes"]["count"] >= 64
            ):
                self.flush_delta()
                old = None
            if old:
                old["attributes"]["count"] += 1
                old["attributes"]["sequence_end"] = self.sequence
                old["attributes"]["last_monotonic_ms"] = value["monotonic_ms"]
                if event.get("event_id"):
                    old["attributes"]["provider_event_ids"].append(event["event_id"])
            else:
                value["attributes"].update(
                    count=1,
                    sequence_end=self.sequence,
                    last_monotonic_ms=value["monotonic_ms"],
                    provider_event_ids=[event["event_id"]]
                    if event.get("event_id")
                    else [],
                )
                self.aggregate = value
            return
        self.flush_delta()
        # Epoch/capture authorization is frozen NOW, never looked up by a delayed worker.
        content = self.capture(value, event)
        usage = None
        if typ in {"response.done", "curator.done"}:
            usage = {**response, "_model": event.get("model", self.model)}
        elif typ == "conversation.item.input_audio_transcription.completed":
            usage = {
                "id": "transcription_" + str(event.get("item_id")),
                "status": "completed",
                "usage": event.get("usage"),
                "_model": "gpt-4o-mini-transcribe",
            }
        self.put((value, content, usage))

    def capture(self, value, event):
        view = store().capture_view(self.call_id)
        if not view or not view["recording"]:
            return None
        if self.segment != view["id"]:
            self.segment = view["id"]
            self.content_ids.clear()
        typ = event.get("type")
        identities = {
            value.get("response_id"),
            value.get("item_id"),
            value.get("function_id"),
            value.get("request_id"),
        } - {None}
        if typ in {
            "response.created",
            "input_audio_buffer.speech_started",
            "mcp.request.start",
        }:
            if len(self.content_ids) + len(identities) > 1024:
                self.failure = "content_identity_limit"
                return None
            self.content_ids.update(identities)
        if typ not in {
            "response.done",
            "conversation.item.input_audio_transcription.completed",
            "response.output_audio_transcript.done",
            "conversation.item.create",
            "mcp.request.start",
            "mcp.request.result",
        } or not identities.intersection(self.content_ids):
            return None
        if typ == "response.done":
            self.content_ids.update(
                i["call_id"]
                for i in event.get("response", {}).get("output", [])
                if i.get("call_id")
            )
        body = json.dumps(redact(event), ensure_ascii=False).encode()
        if len(body) > 100_000:
            self.failure = "content_size_limit"
            return None
        elapsed = max(
            0,
            (
                datetime.fromisoformat(value["timestamp"])
                - datetime.fromisoformat(view["started"])
            ).total_seconds()
            * 1000,
        )
        capture = view["capture_start"] + elapsed
        payload = {
            **value,
            "segment_id": view["id"],
            "generation": view["generation"],
            "content": {"boundary_partial": True, "provider": redact(event)},
        }
        return dict(
            id=value["event_id"] + "_content",
            category="text",
            kind="content",
            payload=json.dumps(payload, ensure_ascii=False).encode(),
            segment_id=view["id"],
            generation=view["generation"],
            capture_start=capture,
            capture_end=capture,
            connection_id=self.connection_id,
        )

    async def run(self):
        while True:
            await self.wait_tick()
            await asyncio.sleep(0.025)
            self.wakeup.clear()
            diagnostic = store()
            if (
                time.monotonic() - diagnostic.reconciled_at > 60
                and not self.maintenance
            ):
                diagnostic.reconciled_at = time.monotonic()
                self.maintenance = asyncio.create_task(
                    asyncio.to_thread(diagnostic.reconcile)
                )

                def maintained(task):
                    if not task.cancelled() and task.exception():
                        self.failure = "diagnostic_reconciliation_failed"
                    self.maintenance = None

                self.maintenance.add_done_callback(maintained)
            self.flush_delta()
            batch = []
            for queue in (self.queue, self.deltas):
                while len(batch) < 40 and not queue.empty():
                    batch.append((queue, queue.get_nowait()))
            if not batch:
                continue
            batch.sort(key=lambda item: item[1][0]["sequence"])
            extra = []
            for _, (_, content, response) in batch:
                if content:
                    extra.append(content)
                if response and isinstance(response.get("id"), str):
                    identity = (
                        "usage_"
                        + hashlib.sha256(
                            (self.call_id + ":" + response["id"]).encode()
                        ).hexdigest()
                    )
                    extra.append(
                        dict(
                            id=identity,
                            category="technical",
                            kind="usage",
                            payload=json.dumps(
                                {
                                    **usage_record(response, response["_model"]),
                                    "observation_source": "sideband",
                                },
                                separators=(",", ":"),
                            ).encode(),
                        )
                    )
            # Duplicate provider finales within this batch retain one usage identity.
            deduplicated = {}
            for entry in extra:
                old = deduplicated.get(entry["id"])
                if (
                    not old
                    or entry["kind"] != "usage"
                    or not json.loads(old["payload"]).get("usage")
                ):
                    deduplicated[entry["id"]] = entry
            extra = list(deduplicated.values())
            self.inflight = len(batch)
            try:
                results = await asyncio.to_thread(
                    store().event_batch,
                    self.call_id,
                    self.owner,
                    [Event.model_validate(item[0]) for _, item in batch],
                    extra=extra,
                    captured=True,
                )
                for result in results:
                    if result.get("content_error"):
                        self.failure = result["content_error"]
                        self.dropped += result["content_dropped_bytes"]
                self.stored += sum(
                    (item[0]["attributes"].get("count") or 1) for _, item in batch
                )
                self.last_lag = max(
                    0, time.monotonic() * 1000 - batch[0][1][0]["monotonic_ms"]
                )
            except Exception as exc:
                code = (
                    exc.code
                    if isinstance(exc, DiagnosticError)
                    else "diagnostic_collection_failed"
                )
                for _, item in batch:
                    self.lost(item[0], code)
            finally:
                self.inflight = 0
                for queue, _ in batch:
                    queue.task_done()

    async def wait_tick(self):
        try:
            await asyncio.wait_for(self.wakeup.wait(), 0.1)
        except TimeoutError:
            pass

    async def close(self):
        if self.ending:
            return
        self.flush_delta()
        self.ending = True
        if self.task:
            try:
                await asyncio.wait_for(
                    asyncio.gather(self.queue.join(), self.deltas.join()), 2
                )
            except TimeoutError:
                self.failure = "diagnostic_flush_incomplete"
                # Count the missing tail, including a disk operation whose outcome is unknown.
                self.missing += max(0, self.sequence - self.stored - self.missing)
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
        # Independent durable metadata final can update a closed call, never content.
        self.final_task = asyncio.create_task(
            asyncio.to_thread(
                store().producer_final,
                self.call_id,
                self.owner,
                "server_" + self.connection_id,
                {
                    **self.status(),
                    "complete": not bool(self.failure or self.missing),
                    "stored_count": self.stored,
                },
            )
        )
        try:
            await asyncio.wait_for(asyncio.shield(self.final_task), 2)
        except (TimeoutError, Exception):
            self.failure = self.failure or "diagnostic_final_pending"
