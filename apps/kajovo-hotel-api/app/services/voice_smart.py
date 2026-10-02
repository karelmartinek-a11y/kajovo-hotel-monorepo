"""Authenticated hotel-owned sideband; browser receives audio and public status only."""

import asyncio
import contextlib
import hashlib
import json
import logging
import time
import uuid
from contextlib import AsyncExitStack
from datetime import timedelta

import httpx
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from voice_core_server import VoiceError, session_config
from voice_core_server.contracts import LANGUAGES
from voice_core_server.policy import LENGTH_POLICIES
from websockets.asyncio.client import connect

from app.db.models import AuthSession, VoiceSmartOperation
from app.db.session import SessionLocal
from app.security.auth import _as_utc, _validate_portal_session
from app.services.smart_technologies import (
    SMART_INSTRUCTIONS,
    SMART_TOOL,
    Catalog,
    SmartArguments,
    SmartError,
    decode_result,
    mcp_connection,
    request_id,
)
from app.time_utils import utc_now

logger = logging.getLogger("kajovo.voice")


def authorized(owner: str) -> bool:
    with SessionLocal() as db:
        record = db.scalar(select(AuthSession).where(AuthSession.session_id == owner))
        now = utc_now()
        if (
            not record
            or record.actor_type != "admin"
            or record.role != "admin"
            or record.revoked_at
            or (_as_utc(record.expires_at) or now) <= now
        ):
            return False
        from app.config import get_settings

        if (
            record.web_activity_session
            and (now - (_as_utc(record.last_activity_at) or now)).total_seconds()
            > get_settings().web_session_idle_seconds
        ):
            return False
        return record.portal_user_id is None or _validate_portal_session(db, record)


def claim_operation(owner: str, voice_id: str, call_id: str, args: dict) -> tuple[str, bool]:
    rid = request_id(voice_id, call_id)
    digest = hashlib.sha256(
        json.dumps(args, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    with SessionLocal() as db:
        record = db.scalar(
            select(VoiceSmartOperation).where(
                VoiceSmartOperation.owner_session_id == owner,
                VoiceSmartOperation.call_id == call_id,
            )
        ) or db.get(VoiceSmartOperation, rid)
        if record:
            if record.owner_session_id != owner or record.arguments_digest != digest:
                raise SmartError("operation_identity_conflict")
            return record.request_id, False
        db.add(
            VoiceSmartOperation(
                request_id=rid,
                owner_session_id=owner,
                call_id=call_id,
                arguments_digest=digest,
                status="pending",
            )
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            record = db.scalar(
                select(VoiceSmartOperation).where(
                    VoiceSmartOperation.owner_session_id == owner,
                    VoiceSmartOperation.call_id == call_id,
                )
            )
            if not record or record.owner_session_id != owner or record.arguments_digest != digest:
                raise SmartError("operation_identity_conflict") from None
            return record.request_id, False
    return rid, True


def own_operation(owner: str, rid: str) -> bool:
    with SessionLocal() as db:
        record = db.get(VoiceSmartOperation, rid)
        return bool(record and record.owner_session_id == owner)


def operation_finished(rid: str, status: str):
    with SessionLocal() as db:
        record = db.get(VoiceSmartOperation, rid)
        if record:
            record.status = status
            db.commit()


class VoiceBridge:
    def __init__(self, owner: str, call_id: str, key: str, token: str, config, model: str):
        self.id = uuid.uuid4().hex
        self.owner, self.call_id, self.key, self.token = owner, call_id, key, token
        self.config, self.model = config, model
        self.technologies = "connecting"
        self.catalog: Catalog | None = None
        self.catalog_item: str | None = None
        self.catalog_ready = False
        self.mcp = None
        self.ws = None
        self.waiters: list[tuple[object, asyncio.Future]] = []
        self.write_lock = asyncio.Lock()
        self.queue = asyncio.Queue()
        self.ready = asyncio.Event()
        self.last_heartbeat = time.monotonic()
        self.task = None
        self.closed = False
        self.renew = False
        self.seen_calls: set[str] = set()
        self.dialog_items: list[str] = []
        self.call_items: dict[str, set[str]] = {}
        self.protected_items: set[str] = set()
        self.input_tokens = 0
        self.pressure = False
        self.pruned = False
        self.rate_reset_at = 0.0
        self.rate_retries = 0

    def public_status(self):
        return {
            "session_id": self.id,
            "technologies": self.technologies,
            "renew": self.renew,
            "closed": self.closed,
        }

    async def send(self, event: dict, match):
        """Resolve on provider acceptance, not WebSocket send; correlate errors by event_id."""
        async with self.write_lock:
            eid = uuid.uuid4().hex
            event["event_id"] = eid
            future = asyncio.get_running_loop().create_future()

            def accepts(value):
                if value.get("type") == "error" and value.get("error", {}).get("event_id") == eid:
                    raise SmartError("realtime_event_rejected")
                return match(value)

            waiter = (accepts, future)
            self.waiters.append(waiter)
            try:
                await self.ws.send(json.dumps(event, ensure_ascii=False, separators=(",", ":")))
                return await asyncio.wait_for(future, timeout=12)
            finally:
                if waiter in self.waiters:
                    self.waiters.remove(waiter)

    async def item(self, item: dict):
        item.setdefault("id", "kv_" + uuid.uuid4().hex[:24])
        await self.send(
            {"type": "conversation.item.create", "item": item},
            lambda e: (
                e.get("type") in {"conversation.item.created", "conversation.item.done"}
                and e.get("item", {}).get("id") == item["id"]
            ),
        )
        return item["id"]

    async def delete_item(self, iid: str):
        await self.send(
            {"type": "conversation.item.delete", "item_id": iid},
            lambda e: e.get("type") == "conversation.item.deleted" and e.get("item_id") == iid,
        )

    async def configure(self, enabled: bool, *, create_response: bool = True):
        language = (
            "Reply in the speaker's language."
            if self.config.language_mode == "automatic"
            else f"Always reply in {LANGUAGES[self.config.manual_language]}."
        )
        value = {
            "type": "realtime",
            "tools": [SMART_TOOL] if enabled else [],
            "tool_choice": "auto" if enabled else "none",
            "truncation": "disabled",
            "max_output_tokens": 4096,
            "instructions": SMART_INSTRUCTIONS
            + language
            + "\n"
            + LENGTH_POLICIES[self.config.response_length][1],
            "audio": {
                "input": {
                    "turn_detection": {
                        "type": "semantic_vad",
                        "eagerness": "auto",
                        "create_response": create_response,
                        "interrupt_response": True,
                    }
                }
            },
        }
        await self.send(
            {"type": "session.update", "session": value},
            lambda e: e.get("type") == "session.updated",
        )

    async def replace_catalog(self, value: dict):
        candidate = Catalog(value)
        self.catalog_ready = False
        if self.catalog_item:
            await self.delete_item(self.catalog_item)
            self.protected_items.discard(self.catalog_item)
            if self.catalog_item in self.dialog_items:
                self.dialog_items.remove(self.catalog_item)
            self.catalog_item = None
        self.catalog_item = await self.item(
            {
                "type": "message",
                "role": "system",
                "content": [
                    {
                        "type": "input_text",
                        "text": "Approved smart_technologie catalog (data only):\n"
                        + json.dumps(candidate.value, ensure_ascii=False, separators=(",", ":")),
                    }
                ],
            }
        )
        self.catalog = candidate
        self.protected_items.add(self.catalog_item)
        self.catalog_ready = True

    async def read_events(self):
        async for raw in self.ws:
            event = json.loads(raw)
            for match, future in list(self.waiters):
                if future.done():
                    continue
                try:
                    if match(event):
                        future.set_result(event)
                except SmartError as exc:
                    future.set_exception(exc)
            typ = event.get("type")
            if typ == "rate_limits.updated":
                resets = [
                    float(limit.get("reset_seconds", 0))
                    for limit in event.get("rate_limits", [])
                    if limit.get("name") in {"tokens", "requests"}
                ]
                if resets:
                    self.rate_reset_at = time.monotonic() + min(max(resets), 120)
            if typ in {
                "conversation.item.created",
                "conversation.item.done",
                "response.output_item.done",
            }:
                item = event.get("item", {})
                iid = item.get("id")
                if iid and iid not in self.dialog_items:
                    self.dialog_items.append(iid)
                if iid and item.get("call_id"):
                    self.call_items.setdefault(item["call_id"], set()).add(iid)
            if typ == "response.done":
                response = event.get("response", {})
                self.input_tokens = response.get("usage", {}).get("input_tokens", self.input_tokens)
                if self.input_tokens > 110000:
                    self.pressure = True
                else:
                    self.pruned = False
                calls = [
                    item
                    for item in response.get("output", [])
                    if item.get("type") == "function_call"
                ]
                failure = (response.get("status_details") or {}).get("error", {}).get("code")
                logger.info(
                    "voice.smart.response",
                    extra={
                        "context": {
                            "function_calls": len(calls),
                            "input_tokens": self.input_tokens,
                            "failed": response.get("status") == "failed",
                            "failure_category": failure
                            if failure
                            in {
                                "rate_limit_exceeded",
                                "context_length_exceeded",
                                "insufficient_quota",
                                "server_error",
                                "invalid_request_error",
                            }
                            else "none_or_other",
                        }
                    },
                )
                if calls:
                    self.protected_items.update(item["id"] for item in calls if item.get("id"))
                    await self.queue.put(calls)
                elif self.pressure:
                    await self.queue.put([])
                if response.get("status") == "failed":
                    if failure == "rate_limit_exceeded" and self.rate_retries < 2:
                        self.rate_retries += 1
                        self.technologies = "waiting"
                        self.rate_reset_at = max(self.rate_reset_at, time.monotonic() + 60)
                        await self.queue.put(None)
                    else:
                        self.renew = True
                        self.catalog_ready = False
                elif not calls:
                    self.rate_retries = 0
            if typ == "error" and event.get("error", {}).get("code") in {
                "context_length_exceeded",
                "input_too_large",
            }:
                self.renew = True
                self.catalog_ready = False
        raise SmartError("sideband_disconnected")

    async def result(self, call: dict):
        cid = call.get("call_id", "")
        if not cid or cid in self.seen_calls:
            return
        self.seen_calls.add(cid)
        rid = None
        images = []
        try:
            if call.get("name") != "smart_technologie" or not authorized(self.owner):
                raise SmartError("unauthorized")
            if not self.catalog_ready or not self.mcp:
                raise SmartError("technologies_unavailable")
            args = SmartArguments.model_validate_json(call["arguments"])
            self.catalog.validate(args)
            payload = args.model_dump(exclude_none=True)
            if args.operation == "operation_status" and not own_operation(
                self.owner, args.request_id
            ):
                raise SmartError("unknown_operation")
            if args.operation == "control":
                payload.pop("request_id", None)
                rid, fresh = claim_operation(self.owner, self.id, cid, payload)
                if not fresh:
                    payload = {"operation": "operation_status", "request_id": rid}
                else:
                    payload["request_id"] = rid
            result = await asyncio.wait_for(
                self.mcp.call_tool("smart_technologie", payload), timeout=25
            )
            public, images = decode_result(result)
            previous_revision = self.catalog.revision
            if "fields" in public or "devices" in public:
                await self.replace_catalog(public)
            if payload.get("catalog_revision") and self.catalog.revision != previous_revision:
                public["error"] = "catalog_revision_changed"
                public["message"] = (
                    "Katalog byl obnoven. Znovu vyber cíle z nové revize; nepřenášej stará čísla řádků."
                )
            output = {
                key: value for key, value in public.items() if key not in {"fields", "devices"}
            }
            if rid:
                output["request_id"] = rid
            tracked = rid or (args.request_id if args.operation == "operation_status" else None)
            if tracked:
                statuses = {r.get("status") for r in public.get("results", [])}
                statuses.add((public.get("operation") or {}).get("status"))
                operation_finished(
                    tracked,
                    "uncertain"
                    if "uncertain" in statuses
                    else "pending"
                    if statuses & {"queued", "recording"}
                    else "completed",
                )
            if images and args.operation != "camera_view":
                raise SmartError("unexpected_image")
        except Exception as exc:
            if rid:
                operation_finished(rid, "uncertain")
            if not isinstance(exc, (SmartError, ValidationError)):
                self.technologies = "unavailable"
                self.catalog_ready = False
            output = {
                "error": str(exc)
                if isinstance(exc, SmartError)
                else "invalid_arguments"
                if isinstance(exc, ValidationError)
                else "technologies_unavailable",
                "message": "Výsledek není potvrzený. Změnu neopakuj; nejprve zjisti operation_status původního request_id."
                if rid
                else "Požadavek nebyl potvrzen. Oprav výběr podle katalogu nebo oznam nedostupnost; netvrď úspěch.",
            }
            if rid:
                output["request_id"] = rid
            images = []
            logger.info(
                "voice.smart.operation_failed",
                extra={
                    "context": {
                        "category": output["error"],
                        "control_identity_reserved": rid is not None,
                        "failure_type": type(exc).__name__
                        if isinstance(exc, (ValidationError, TimeoutError, SmartError))
                        else "transport_or_provider",
                    }
                },
            )
        iid = await self.item(
            {
                "type": "function_call_output",
                "call_id": cid,
                "output": json.dumps(output, ensure_ascii=False),
            }
        )
        self.protected_items.add(iid)
        for image in images:
            try:
                await self.item(
                    {
                        "type": "message",
                        "role": "user",
                        "content": [
                            {
                                "type": "input_image",
                                "image_url": f"data:{image['mime']};base64,{image['data']}",
                            }
                        ],
                    }
                )
            except Exception:
                await self.item(
                    {
                        "type": "message",
                        "role": "system",
                        "content": [
                            {
                                "type": "input_text",
                                "text": "Obrazový vstup nebyl potvrzen. Netvrď, že jsi obraz prohlédl.",
                            }
                        ],
                    }
                )

    async def prune(self):
        if not self.pressure:
            return
        candidates = [iid for iid in self.dialog_items[:-8] if iid not in self.protected_items]
        # A function call and its output must be deleted together, never across the retention boundary.
        candidate_set = set(candidates)
        for items in self.call_items.values():
            if not items <= candidate_set:
                candidate_set -= items
        candidates = [iid for iid in candidates if iid in candidate_set]
        if not candidates or self.pruned:
            self.renew = True
            self.catalog_ready = False
            await self.configure(False)
            return
        for iid in candidates:
            await self.delete_item(iid)
            self.dialog_items.remove(iid)
        self.call_items = {
            cid: items for cid, items in self.call_items.items() if not items <= candidate_set
        }
        self.pressure = False
        self.pruned = True

    async def work(self):
        while True:
            calls = await self.queue.get()
            if calls is None:
                await self.configure(self.catalog_ready, create_response=False)
                while time.monotonic() < self.rate_reset_at:
                    await asyncio.sleep(min(5, self.rate_reset_at - time.monotonic()))
                if not authorized(self.owner):
                    raise SmartError("unauthorized")
                await self.configure(self.catalog_ready)
                self.technologies = "ready" if self.catalog_ready else "unavailable"
                # Resume generation from the already-acknowledged results. Never call MCP again.
                await self.send(
                    {"type": "response.create"}, lambda e: e.get("type") == "response.created"
                )
                continue
            for call in calls:
                await self.result(call)
            if self.technologies == "unavailable" and not self.catalog_ready:
                await self.configure(False)
            self.protected_items = {self.catalog_item} if self.catalog_item else set()
            await self.prune()
            if calls and not self.renew:
                await self.send(
                    {"type": "response.create"}, lambda e: e.get("type") == "response.created"
                )

    async def lease(self):
        while True:
            await asyncio.sleep(5)
            if time.monotonic() - self.last_heartbeat > 45 or not authorized(self.owner):
                return

    async def run(self):
        tasks = []
        try:
            async with AsyncExitStack() as stack:
                self.ws = await stack.enter_async_context(
                    connect(
                        "wss://api.openai.com/v1/realtime?call_id=" + self.call_id,
                        additional_headers={"Authorization": f"Bearer {self.key}"},
                        max_size=16 * 1024 * 1024,
                        open_timeout=10,
                    )
                )
                reader = asyncio.create_task(self.read_events())
                tasks.append(reader)
                try:
                    if self.model != "gpt-realtime-2.1":
                        raise SmartError("model_unsupported")
                    self.mcp = await stack.enter_async_context(mcp_connection(self.token))
                    public, _ = decode_result(
                        await self.mcp.call_tool("smart_technologie", {"operation": "catalog"})
                    )
                    if public.get("error"):
                        raise SmartError("catalog_unavailable")
                    await self.replace_catalog(public)
                    with SessionLocal() as db:
                        pending = list(
                            db.scalars(
                                select(VoiceSmartOperation.request_id).where(
                                    VoiceSmartOperation.owner_session_id == self.owner,
                                    VoiceSmartOperation.status.in_(["pending", "uncertain"]),
                                )
                            )
                        )
                    if pending:
                        await self.item(
                            {
                                "type": "message",
                                "role": "system",
                                "content": [
                                    {
                                        "type": "input_text",
                                        "text": "Previous unconfirmed controls: "
                                        + json.dumps(pending)
                                        + ". Check operation_status; do not replay.",
                                    }
                                ],
                            }
                        )
                    self.technologies = "ready"
                except Exception:
                    self.technologies = "unavailable"
                    self.catalog_ready = False
                await self.configure(self.catalog_ready)
                logger.info(
                    "voice.smart.ready",
                    extra={"context": {"technologies": self.technologies, "model": self.model}},
                )
                self.ready.set()
                tasks += [asyncio.create_task(self.work()), asyncio.create_task(self.lease())]
                await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                if not self.renew and authorized(self.owner):
                    with contextlib.suppress(Exception):
                        await self.configure(False)
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
        except Exception:
            self.technologies = "unavailable"
            self.renew = True
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            self.closed = True
            self.ready.set()
            for _, future in self.waiters:
                if not future.done():
                    future.set_exception(SmartError("sideband_disconnected"))
            await self.hangup()
            self.key = self.token = ""

    async def hangup(self):
        with contextlib.suppress(Exception):
            async with httpx.AsyncClient(timeout=5) as http:
                await http.post(
                    f"https://api.openai.com/v1/realtime/calls/{self.call_id}/hangup",
                    headers={"Authorization": f"Bearer {self.key}"},
                )

    async def close(self):
        self.renew = False
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
        self.closed = True


class VoiceBridgeManager:
    def __init__(self):
        self.sessions: dict[str, VoiceBridge] = {}

    async def create(self, sdp: str, config, key: str, owner: str, token: str):
        models = (
            [config.manual_model]
            if config.model_mode == "manual"
            else ["gpt-realtime-2.1", "gpt-realtime-2"]
        )
        async with httpx.AsyncClient(timeout=25) as http:
            for model in models:
                settings = session_config(config, model)
                settings["audio"]["input"]["turn_detection"]["create_response"] = False
                settings["truncation"] = "disabled"
                response = await http.post(
                    "https://api.openai.com/v1/realtime/calls",
                    headers={"Authorization": f"Bearer {key}"},
                    files={
                        "sdp": (None, sdp, "application/sdp"),
                        "session": (None, json.dumps(settings), "application/json"),
                    },
                )
                if response.is_success:
                    break
                try:
                    code = response.json().get("error", {}).get("code")
                except Exception:
                    code = None
                if (
                    code in {"model_not_found", "model_not_available", "unsupported_model"}
                    and config.model_mode == "automatic"
                ):
                    continue
                raise VoiceError(
                    "invalid_api_key"
                    if response.status_code == 401
                    else "rate_limited"
                    if response.status_code == 429
                    else "provider_unavailable"
                )
            else:
                raise VoiceError("model_unavailable")
        location = response.headers.get("location", "")
        call_id = location.rsplit("/", 1)[-1]
        if (
            not response.text.startswith("v=0")
            or not call_id.startswith("rtc_")
            or not all(c.isalnum() or c in "_-" for c in call_id)
        ):
            raise VoiceError("session_creation_failed")
        bridge = VoiceBridge(owner, call_id, key, token, config, model)
        self.sessions = {sid: value for sid, value in self.sessions.items() if not value.closed}
        self.sessions[bridge.id] = bridge
        bridge.task = asyncio.create_task(bridge.run())
        # WebRTC must connect before sideband initialization can finish on every provider runtime.
        return {
            "sdp": response.text,
            "model": model,
            **bridge.public_status(),
            "managed_functions": ["smart_technologie"],
        }

    def get(self, sid: str, owner: str):
        bridge = self.sessions.get(sid)
        if not bridge or bridge.owner != owner:
            return None
        return bridge

    async def shutdown(self):
        for bridge in list(self.sessions.values()):
            await bridge.close()
        self.sessions.clear()

    async def housekeeping(self):
        while True:
            await asyncio.sleep(60)
            self.sessions = {sid: value for sid, value in self.sessions.items() if not value.closed}
            with SessionLocal() as db:
                db.execute(
                    delete(VoiceSmartOperation).where(
                        VoiceSmartOperation.created_at < utc_now() - timedelta(days=30)
                    )
                )
                db.commit()


manager = VoiceBridgeManager()
