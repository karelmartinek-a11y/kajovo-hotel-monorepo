from typing import Annotated
from uuid import UUID
from .invalidation import invalidate

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .api_core import require_voice_admin
from .models import VoiceConversationSummary, VoiceMemorySettings
from .ports import get_db
from .ports import require_session
from . import memory
from . import memory_dispatch
from .memory_contract import (
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
    prefix="",
    tags=["voice-memory"],
    dependencies=[Depends(require_voice_admin)],
)
Db = Annotated[Session, Depends(get_db)]


def owner(request, db):
    try:
        pid = memory.principal(db, require_session(request, db))
        memory.ensure_profile(db, pid)
        return pid
    except memory.MemoryError:
        raise HTTPException(403, detail={"code": "unauthorized"}) from None




@router.post("/operations", response_model=MemoryResult)
async def operation(payload: MemoryRequest, db: Db, request: Request):
    pid = owner(request, db)
    identity = require_session(request)
    operation_key = request.headers.get("x-dagmar-operation-id")
    if operation_key and (len(operation_key) > 128 or not all(c.isalnum() or c in "_-" for c in operation_key)):
        raise HTTPException(422, detail={"code":"invalid_arguments"})
    result = await memory_dispatch.execute(db, pid, payload, session_id=str(identity["session_id"]) if operation_key else None, call_id=operation_key, receipt_namespace=identity["namespace"])
    if result.code == "ok" and payload.request.operation not in {"memory_list", "memory_search", "memory_read", "note_list", "note_read", "summary_read"}:
        await invalidate(pid, deleted=payload.request.operation in {"memory_forget", "note_delete", "note_clear"})
    errors = {
        "profile_protected": 403,
        "unauthorized": 403,
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
async def search(payload: Search, db: Db, request: Request):
    return await memory_dispatch.execute(db, owner(request, db), MemoryRequest(request=payload))


@router.get("/memories", response_model=MemoryResult)
async def memories(
    db: Db,
    request: Request,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0, le=10000),
):
    return await memory_dispatch.execute(
        db,
        owner(request, db),
        MemoryRequest(
            request=MemoryList(operation="memory_list", status=None, limit=limit, offset=offset)
        ),
    )


@router.get("/memories/{identity}", response_model=MemoryResult)
async def read_memory(identity: UUID, db: Db, request: Request):
    return await memory_dispatch.execute(
        db,
        owner(request, db),
        MemoryRequest(request=ReadMemory(operation="memory_read", id=identity)),
    )


@router.get("/notes", response_model=MemoryResult)
async def notes(
    db: Db,
    request: Request,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0, le=10000),
    archived: bool = False,
):
    return await memory_dispatch.execute(
        db,
        owner(request, db),
        MemoryRequest(
            request=NoteList(
                operation="note_list", query="", archived=archived, limit=limit, offset=offset
            )
        ),
    )


@router.get("/notes/{identity}", response_model=MemoryResult)
async def read_note(identity: UUID, db: Db, request: Request):
    return await memory_dispatch.execute(
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
async def read_summary(identity: UUID, db: Db, request: Request):
    return await memory_dispatch.execute(
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
