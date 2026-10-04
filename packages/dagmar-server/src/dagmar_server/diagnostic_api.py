"""Portable HTTP boundary; the host injects live authorization and ownership."""
import asyncio
import hashlib
import json
import tarfile
from typing import Callable

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import Field
from .diagnostic_contract import Closed, Event, ID_PATTERN, MAX_CHUNK, redact
from .diagnostics import DiagnosticError


class Capture(Closed):
    capture_ms: float = Field(ge=0)
    complete: bool = False


class EventBatch(Closed):
    events: list[Event] = Field(max_length=32)


class ChunkInfo(Closed):
    segment_id: str = Field(pattern=ID_PATTERN)
    generation: int = Field(ge=1)
    track_id: str = Field(max_length=128)
    source_id: str = Field(pattern=r"^(microphone|remote)$")
    mime: str = Field(max_length=128)
    sequence: int = Field(ge=0)
    capture_start_ms: float = Field(ge=0)
    capture_end_ms: float = Field(ge=0)
    final: bool = False
    boundary_partial: bool = False


def router_for(get_store: Callable, authorize: Callable[[Request], str]):
    router = APIRouter()

    def auth(request):
        return authorize(request)

    async def invoke(function, *args, **kwargs):
        try:
            return await asyncio.to_thread(function, *args, **kwargs)
        except DiagnosticError as exc:
            raise HTTPException(exc.status, detail={"code": exc.code}) from None

    @router.post("/diagnostics/calls")
    async def begin(request: Request):
        owner = auth(request)
        return await invoke(get_store().create_call, owner)

    @router.get("/diagnostics/calls")
    async def calls(request: Request):
        owner = auth(request)
        store = get_store()
        await invoke(store.audit, owner, "list")
        return {"calls": await invoke(store.listing)}

    @router.get("/diagnostics/capacity")
    async def capacity(request: Request):
        auth(request)
        return await invoke(get_store().capacity)

    @router.post("/diagnostics/calls/{call_id}/events")
    async def events(call_id: str, payload: EventBatch, request: Request):
        owner = auth(request)
        store = get_store()
        results = []
        for event in payload.events:
            if event.source != "browser":
                raise HTTPException(422, detail={"code":"invalid_event_source"})
            auth(request)
            results.append(await invoke(store.event, call_id, owner, event))
        return {"results": results}

    @router.post("/diagnostics/calls/{call_id}/segments")
    async def start(call_id: str, payload: Capture, request: Request):
        return await invoke(get_store().start, call_id, auth(request), payload.capture_ms)

    @router.post("/diagnostics/calls/{call_id}/segments/{segment_id}/stop")
    async def stop(call_id: str, segment_id: str, payload: Capture, request: Request):
        return await invoke(get_store().stop, call_id, auth(request), segment_id, payload.capture_ms, payload.complete)

    @router.put("/diagnostics/calls/{call_id}/chunks/{chunk_id}")
    async def upload(call_id: str, chunk_id: str, request: Request):
        owner = auth(request)
        # Header is bounded and parsed strictly; binary body is capped while streaming.
        try:
            raw = request.headers.get("x-dagmar-chunk", "")
            if len(raw) > 2048 or not __import__("re").fullmatch(ID_PATTERN, chunk_id):
                raise ValueError
            info = ChunkInfo.model_validate_json(raw)
        except (ValueError, TypeError):
            raise HTTPException(422, detail={"code": "invalid_chunk"}) from None
        data = bytearray()
        async for part in request.stream():
            if len(data) + len(part) > MAX_CHUNK:
                raise HTTPException(413, detail={"code": "chunk_too_large"})
            data.extend(part)
        auth(request)
        store = get_store()
        result = await invoke(store.write, call_id, owner, chunk_id, "audio", "audio", bytes(data), segment_id=info.segment_id, generation=info.generation, capture_start=info.capture_start_ms, capture_end=info.capture_end_ms, sequence=info.sequence, source=info.source_id)
        # Same chunk identity also protects its decoder metadata.
        manifest = json.dumps(info.model_dump(), separators=(",", ":")).encode()
        await invoke(store.write, call_id, owner, chunk_id + "_manifest", "text", "audio_manifest", manifest, segment_id=info.segment_id, generation=info.generation, capture_start=info.capture_start_ms, capture_end=info.capture_end_ms)
        return result

    @router.post("/diagnostics/calls/{call_id}/close")
    async def close(call_id: str, request: Request):
        return await invoke(get_store().close, call_id, auth(request))

    @router.get("/diagnostics/calls/{call_id}")
    async def detail(call_id: str, request: Request):
        owner = auth(request)
        store = get_store()
        await invoke(store.audit, owner, "read", call_id)
        return await invoke(store.manifest, call_id)

    @router.post("/diagnostics/calls/{call_id}/pin")
    async def pin(call_id: str, request: Request):
        return await invoke(get_store().pin, call_id, auth(request))

    @router.delete("/diagnostics/calls/{call_id}")
    async def delete(call_id: str, request: Request):
        return await invoke(get_store().delete, call_id, auth(request))

    @router.get("/diagnostics/calls/{call_id}/export", include_in_schema=True)
    @router.post("/diagnostics/calls/{call_id}/export")
    async def export(call_id: str, request: Request):
        # Native browser downloads stream to disk without a whole-export JS Blob.
        if request.headers.get("sec-fetch-site") == "cross-site":
            raise HTTPException(403,detail={"code":"cross_site_export_forbidden"})
        owner = auth(request)
        store = get_store()
        await invoke(store.audit, owner, "export", call_id)
        manifest = await invoke(store.manifest, call_id)
        def entry(name, content):
            info = tarfile.TarInfo(name)
            info.size = len(content)
            info.mode = 0o600
            yield info.tobuf(format=tarfile.USTAR_FORMAT)
            yield content
            if len(content) % 512:
                yield b"\0" * (512 - len(content) % 512)
        async def protected_stream():
            for part in entry("manifest.json", json.dumps(redact(manifest), ensure_ascii=False).encode()):
                auth(request)
                yield part
            # Content objects are independently bounded and decrypted only when emitted.
            iterator = iter(store.objects_for_export(call_id))
            def advance():
                try:
                    return next(iterator)
                except StopIteration:
                    return None
            digest = hashlib.sha256()
            count = 0
            while True:
                auth(request)
                item = await asyncio.to_thread(advance)
                if item is None:
                    break
                row, payload = item
                if row["kind"] != "audio":
                    value = json.loads(payload)
                    redacted = redact(value)
                    if value != redacted:
                        payload = json.dumps(redacted, ensure_ascii=False).encode()
                object_manifest = json.dumps({**{k:v for k,v in row.items() if k!="object_id"},"export_checksum":hashlib.sha256(payload).hexdigest(),"export_bytes":len(payload)},separators=(",",":")).encode()
                digest.update(object_manifest)
                count += 1
                for part in entry("objects/"+row["id"]+".manifest.json",object_manifest):
                    auth(request)
                    yield part
                for part in entry("objects/" + row["id"] + (".bin" if row["kind"] == "audio" else ".json"), payload):
                    auth(request)
                    yield part
            for part in entry("integrity.json",json.dumps({"objects":count,"ordered_object_manifests_sha256":digest.hexdigest()}).encode()):
                auth(request)
                yield part
            yield b"\0" * 1024
        return StreamingResponse(protected_stream(), media_type="application/x-tar", headers={"Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="dagmar-' + hashlib.sha256(call_id.encode()).hexdigest()[:16] + '.tar"'})

    return router
