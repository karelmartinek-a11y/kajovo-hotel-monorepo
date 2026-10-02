from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.routes.voice_core import require_voice_admin
from app.db.models import VoiceConversationSummary, VoiceMemorySettings
from app.db.session import get_db
from app.security.auth import require_session
from app.services import voice_memory as memory
from app.services.voice_memory_contract import (
    MemoryList,
    MemoryRequest,
    MemoryResult,
    NoteList,
    ReadMemory,
    NoteRead,
    SettingsRead,
    SettingsWrite,
    Search,
    SummaryRead,
)

router = APIRouter(
    prefix="/api/v1/admin/voice-memory",
    tags=["voice-memory"],
    dependencies=[Depends(require_voice_admin)],
)
Db = Annotated[Session, Depends(get_db)]


def owner(request, db):
    try:
        return memory.principal(db, require_session(request, db))
    except memory.MemoryError:
        raise HTTPException(403, detail={"code": "unauthorized"}) from None


async def invalidate(pid, *, deleted=False):
    from app.services.voice_smart import manager

    for bridge in list(manager.sessions.values()):
        if getattr(bridge, "memory_principal", None) == pid and not bridge.closed:
            if deleted:
                # The provider's live dialogue can still paraphrase old user turns.
                # Resume automatic extraction only in a fresh conversation.
                bridge.memory_privacy_paused = True
            if bridge.memory_buffer:
                bridge.memory_buffer.reset(invalidate=True)
                try:
                    with bridge.memory_buffer.factory() as db:
                        config = db.get(VoiceMemorySettings, pid)
                        automatic = (
                            config.automatic and not bridge.memory_privacy_paused
                            if config
                            else False
                        )
                except Exception:
                    automatic = False
                    bridge.memory_status = "unavailable"
                bridge.memory_buffer.enabled = automatic
                try:
                    await bridge.update_transcription()
                except Exception:
                    bridge.memory_status = "unavailable"
            if deleted:
                # Existing provider tool results can contain forgotten content. Remove them from the active conversation too.
                targets = set(bridge.memory_outputs)
                for pair in bridge.call_items.values():
                    if pair & targets:
                        targets.update(pair)
                for iid in list(targets):
                    try:
                        await bridge.delete_item(iid)
                        bridge.protected_items.discard(iid)
                        if iid in bridge.dialog_items:
                            bridge.dialog_items.remove(iid)
                        bridge.memory_outputs.discard(iid)
                    except Exception:
                        bridge.renew = True
            await bridge.refresh_memory_context()


@router.post("/operations", response_model=MemoryResult)
async def operation(payload: MemoryRequest, db: Db, request: Request):
    pid = owner(request, db)
    result = memory.execute(db, pid, payload)
    if result.code == "ok" and payload.request.operation in {"memory_forget", "note_delete"}:
        await invalidate(pid, deleted=True)
    errors = {
        "revision_conflict": 409,
        "identity_conflict": 409,
        "not_found": 404,
        "invalid_arguments": 422,
        "sensitive_content_rejected": 422,
        "unavailable": 503,
    }
    if result.code in errors:
        raise HTTPException(errors[result.code], detail={"code": result.code})
    return result


@router.post("/search", response_model=MemoryResult)
def search(payload: Search, db: Db, request: Request):
    return memory.execute(db, owner(request, db), MemoryRequest(request=payload))


@router.get("/memories", response_model=MemoryResult)
def memories(
    db: Db,
    request: Request,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0, le=10000),
):
    return memory.execute(
        db,
        owner(request, db),
        MemoryRequest(
            request=MemoryList(operation="memory_list", status=None, limit=limit, offset=offset)
        ),
    )


@router.get("/memories/{identity}", response_model=MemoryResult)
def read_memory(identity: UUID, db: Db, request: Request):
    return memory.execute(
        db,
        owner(request, db),
        MemoryRequest(request=ReadMemory(operation="memory_read", id=identity)),
    )


@router.get("/notes", response_model=MemoryResult)
def notes(
    db: Db,
    request: Request,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0, le=10000),
    archived: bool = False,
):
    return memory.execute(
        db,
        owner(request, db),
        MemoryRequest(
            request=NoteList(
                operation="note_list", query="", archived=archived, limit=limit, offset=offset
            )
        ),
    )


@router.get("/notes/{identity}", response_model=MemoryResult)
def read_note(identity: UUID, db: Db, request: Request):
    return memory.execute(
        db, owner(request, db), MemoryRequest(request=NoteRead(operation="note_read", id=identity))
    )


@router.get("/summaries", response_model=MemoryResult)
def summaries(
    db: Db,
    request: Request,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0, le=10000),
):
    pid = owner(request, db)
    rows = db.scalars(
        select(VoiceConversationSummary)
        .where(VoiceConversationSummary.principal_id == pid)
        .order_by(VoiceConversationSummary.created_at.desc())
        .limit(limit + 1)
        .offset(offset)
    ).all()
    return MemoryResult(
        operation="memory_search",
        code="ok",
        summaries=[memory.summary_read(r) for r in rows[:limit]],
        has_more=len(rows) > limit,
    )


@router.get("/summaries/{identity}", response_model=MemoryResult)
def read_summary(identity: UUID, db: Db, request: Request):
    return memory.execute(
        db,
        owner(request, db),
        MemoryRequest(request=SummaryRead(operation="summary_read", id=identity)),
    )


@router.get("/settings", response_model=SettingsRead)
def settings(db: Db, request: Request):
    row = db.get(VoiceMemorySettings, owner(request, db))
    return SettingsRead(automatic=row.automatic, revision=row.revision)


@router.put("/settings", response_model=SettingsRead)
async def write_settings(payload: SettingsWrite, db: Db, request: Request):
    pid = owner(request, db)
    changed = db.execute(
        update(VoiceMemorySettings)
        .where(
            VoiceMemorySettings.principal_id == pid,
            VoiceMemorySettings.revision == payload.revision,
        )
        .values(
            automatic=payload.automatic,
            revision=payload.revision + 1,
            generation=VoiceMemorySettings.generation + 1,
        )
    )
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, detail={"code": "revision_conflict"})
    db.commit()
    await invalidate(pid)
    return SettingsRead(automatic=payload.automatic, revision=payload.revision + 1)
