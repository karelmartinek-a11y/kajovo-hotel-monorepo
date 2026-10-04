"""Dagmar-owned shared memory transactions. Call authorization belongs to the injected host port."""

import hashlib
import json
import re
import unicodedata
from datetime import datetime, time, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import case, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .models import (
    VoiceConversationSummary,
    VoiceMemory,
    VoiceMemoryDependency,
    VoiceMemoryOperation,
    VoiceMemoryPrincipal,
    VoiceMemoryRevision,
    VoiceMemorySettings,
    VoiceNote,
    VoiceNoteItem,
)
from .memory_contract import (
    MemoryRead,
    MemoryRequest,
    MemoryResult,
    NoteItemRead,
    NoteRecord,
    SummaryRecord,
)
def utc_now():
    return datetime.now(timezone.utc)


def uid():
    return str(uuid4())


def normalize(text: str) -> str:
    return " ".join(
        re.sub(
            r"[^a-z0-9]+",
            " ",
            unicodedata.normalize("NFKD", text.casefold()).encode("ascii", "ignore").decode(),
        ).split()
    )


def secret_content(text: str) -> bool:
    return bool(
        re.search(
            r"(?i)(\b(?:password|heslo|api.?key|api.?klic|token|secret|cvv|pin|bezpecnostni kod)\s*(?:[:=]|\bje\b|\bis\b)|\bsk-[a-zA-Z0-9_-]{8,}|\bBearer\s+\S+|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b)",
            normalize(text) + "\n" + text,
        )
    )


def sensitive_content(text: str) -> bool:
    normalized = normalize(text)
    return bool(
        re.search(
            r"\b(zdravi|diagnoz\w*|lecim|nemoc\w*|sexual\w*|naboz\w*|politick\w*|rodne cislo|cislo karty)\b",
            normalized,
        )
    )


class MemoryError(Exception):
    pass


SHARED_SPACE = "dagmar-shared-admin-v1"
PROFILE_ID = "2854a40b-9d17-54ec-ae43-d94b2fa253bc"
PROFILE_CONTENT = "Jsem Dagmar, žena a asistentka Karla Martínka. Pomohu se vším v rozsahu dostupných schopností."


def principal(db: Session, identity: dict) -> str:
    # The host must supply a freshly verified principal, never model arguments.
    if not identity.get("voice_authorized") or not identity.get("namespace"):
        raise MemoryError("unauthorized")
    row = db.scalar(select(VoiceMemoryPrincipal).where(VoiceMemoryPrincipal.namespace == SHARED_SPACE))
    if row is None:
        try:
            with db.begin_nested():
                row = VoiceMemoryPrincipal(id=uid(), namespace=SHARED_SPACE)
                db.add(row)
                db.flush()
                db.add(VoiceMemorySettings(principal_id=row.id, automatic=True, revision=0, generation=0))
                db.flush()
        except IntegrityError:
            row = db.scalar(select(VoiceMemoryPrincipal).where(VoiceMemoryPrincipal.namespace == SHARED_SPACE))
    db.commit()
    return row.id


def ensure_profile(db: Session, pid: str):
    row = db.get(VoiceMemory, PROFILE_ID)
    now = utc_now()
    if row is None:
        row = VoiceMemory(id=PROFILE_ID, principal_id=pid, kind="fact", subject="Identita Dagmar",
            content=PROFILE_CONTENT, tags=["dagmar-profile"], search_text=normalize(PROFILE_CONTENT),
            status="active", origin="explicit", pinned=True, importance=10, revision=1,
            created_at=now, updated_at=now, creator_namespace="approved-policy")
        try:
            with db.begin_nested():
                db.add(row)
                db.flush()
        except IntegrityError:
            # Concurrent authorized calls insert the same deterministic profile.
            # Resolve its committed identity; never turn an idempotent seed into a 500.
            row = db.scalar(select(VoiceMemory).where(VoiceMemory.id == PROFILE_ID).with_for_update())
            if row is None:
                raise
    if row.principal_id != pid:
        raise MemoryError("profile_space_conflict")
    if row.content != PROFILE_CONTENT or not row.pinned or row.status != "active":
        archive_revision(db, row, "approved-policy", "profile-policy")
        row.content, row.pinned, row.status = PROFILE_CONTENT, True, "active"
        row.revision += 1
        row.updated_at = now
    db.commit()
    return row


def memory_read(row):
    return MemoryRead.model_validate({name: getattr(row, name) for name in MemoryRead.model_fields})


def note_read(db, row, *, header=False):
    if header:
        count = db.scalar(
            select(func.count()).select_from(VoiceNoteItem).where(VoiceNoteItem.note_id == row.id)
        )
        items = []
    else:
        items = db.scalars(
            select(VoiceNoteItem)
            .where(VoiceNoteItem.note_id == row.id)
            .order_by(VoiceNoteItem.position)
            .limit(100)
        ).all()
        count = len(items)
    return NoteRecord(
        **{
            name: getattr(row, name)
            for name in NoteRecord.model_fields
            if name not in {"items", "item_count"}
        },
        items=[]
        if header
        else [NoteItemRead(id=i.id, content=i.content, position=i.position) for i in items],
        item_count=count,
    )


def summary_read(row):
    return SummaryRecord.model_validate(
        {name: getattr(row, name) for name in SummaryRecord.model_fields}
    )


def owned(db, cls, pid, identity):
    row = db.scalar(select(cls).where(cls.id == str(identity), cls.principal_id == pid))
    if row is None:
        raise MemoryError("not_found")
    return row


def bump(db, cls, row, revision):
    changed = db.execute(
        update(cls)
        .where(cls.id == row.id, cls.revision == revision)
        .values(revision=revision + 1, updated_at=utc_now())
        .execution_options(synchronize_session=False)
    )
    if changed.rowcount != 1:
        raise MemoryError("revision_conflict")
    db.refresh(row)


def archive_revision(db, row, source, reason):
    db.add(
        VoiceMemoryRevision(
            id=uid(),
            memory_id=row.id,
            revision=row.revision,
            subject=row.subject,
            content=row.content,
            status=row.status,
            source_session_id=source,
            reason=reason,
            created_at=utc_now(),
        )
    )


def terms(query):
    stop = {
        "co",
        "si",
        "o",
        "me",
        "mne",
        "jsme",
        "mam",
        "na",
        "s",
        "se",
        "ohledne",
        "minule",
        "posledne",
        "resili",
        "kde",
        "jak",
        "a",
        "v",
        "the",
    }
    return [term for term in normalize(query).split() if term not in stop][:12]


def ranked_query(cls, pid, query):
    words = terms(query)
    filters = [cls.principal_id == pid]
    if cls is VoiceMemory:
        filters.append(cls.status == "active")
    scores = []
    for word in words:
        prefix = word[: max(4, len(word) - 2)] if len(word) >= 6 else word
        match = cls.search_text.contains(prefix, autoescape=True)
        scores.append(case((match, 10), else_=0))
        if cls is VoiceMemory:
            # Accent-normalized subject and tags occupy the start of search_text. Exact title boosts use casefold for portable SQL.
            scores.append(case((cls.subject.ilike(f"%{word}%", escape="\\"), 8), else_=0))
    if words:
        filters.append(
            or_(
                *[
                    cls.search_text.contains(
                        word[: max(4, len(word) - 2)] if len(word) >= 6 else word, autoescape=True
                    )
                    for word in words
                ]
            )
        )
    score = sum(scores)
    if cls is VoiceMemory:
        score += case((cls.pinned.is_(True), 20), else_=0) + cls.importance
    return (
        select(cls)
        .where(*filters)
        .order_by(
            score.desc() if hasattr(score, "desc") else cls.updated_at.desc(),
            cls.updated_at.desc(),
            cls.id,
        )
    )


def search(db, pid, request):
    result = MemoryResult(operation=request.operation, code="ok")
    for cls, output, convert in [
        (VoiceMemory, "memories", memory_read),
        (VoiceConversationSummary, "summaries", summary_read),
    ]:
        if request.scope != "all" and request.scope != output:
            continue
        stmt = ranked_query(cls, pid, request.query)
        for tag in request.tags:
            stmt = stmt.where(cls.search_text.contains(normalize(tag), autoescape=True))
        if request.date_from:
            stmt = stmt.where(
                cls.created_at
                >= datetime.combine(
                    request.date_from, time.min, ZoneInfo("Europe/Prague")
                ).astimezone(timezone.utc)
            )
        if request.date_to:
            stmt = stmt.where(
                cls.created_at
                < datetime.combine(
                    request.date_to + timedelta(days=1), time.min, ZoneInfo("Europe/Prague")
                ).astimezone(timezone.utc)
            )
        rows = db.scalars(stmt.limit(request.limit + 1)).all()
        result.has_more |= len(rows) > request.limit
        setattr(result, output, [convert(row) for row in rows[: request.limit]])
        if cls is VoiceMemory:
            for row in rows[: request.limit]:
                row.last_used_at = utc_now()
    if request.scope in {"all", "notes"}:
        stmt = select(VoiceNote).where(VoiceNote.principal_id == pid, VoiceNote.status == "active")
        for word in terms(request.query):
            stmt = stmt.where(VoiceNote.normalized_title.contains(word, autoescape=True))
        rows = db.scalars(stmt.order_by(VoiceNote.updated_at.desc(), VoiceNote.id).limit(request.limit + 1)).all()
        result.notes = [note_read(db, row, header=True) for row in rows[:request.limit]]
        result.has_more |= len(rows) > request.limit
    return result


def apply(db, pid, req, source=None, *, automatic=False):
    op = req.operation
    if str(getattr(req, "id", "")) == PROFILE_ID and op in {"memory_update", "memory_forget"}:
        raise MemoryError("profile_protected")
    result = MemoryResult(operation=op, code="ok")
    if op == "memory_search":
        return search(db, pid, req)
    if op == "memory_list":
        stmt = select(VoiceMemory).where(VoiceMemory.principal_id == pid)
        if req.status is not None:
            stmt = stmt.where(VoiceMemory.status == req.status)
        rows = db.scalars(
            stmt.order_by(VoiceMemory.updated_at.desc(), VoiceMemory.id)
            .limit(req.limit + 1)
            .offset(req.offset)
        ).all()
        result.memories = [memory_read(r) for r in rows[: req.limit]]
        result.has_more = len(rows) > req.limit
        return result
    if op == "memory_remember":
        if secret_content(" ".join([req.subject, req.content, *req.tags])) or (
            sensitive_content(req.content) and automatic
        ):
            raise MemoryError("sensitive_content_rejected")
        matches = db.scalars(
            select(VoiceMemory)
            .where(
                VoiceMemory.principal_id == pid,
                VoiceMemory.kind == req.kind,
                VoiceMemory.search_text.contains(normalize(req.subject), autoescape=True),
            )
            .limit(3)
        ).all()
        same = [r for r in matches if normalize(r.subject) == normalize(req.subject)]
        if same:
            if len(same) == 1 and same[0].content == req.content:
                result.memory = memory_read(same[0])
                return result
            result.code = "ambiguous"
            result.memories = [memory_read(r) for r in same]
            return result
        now = utc_now()
        row = VoiceMemory(
            id=uid(),
            principal_id=pid,
            kind=req.kind,
            subject=req.subject,
            content=req.content,
            tags=req.tags,
            search_text=normalize(" ".join([req.subject, req.content, *req.tags])),
            status="active",
            origin="automatic" if automatic else "explicit",
            pinned=False,
            importance=5,
            revision=1,
            source_session_id=source,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        db.flush()
        result.memory = memory_read(row)
        return result
    if op in {"memory_read", "memory_update", "memory_forget"}:
        row = owned(db, VoiceMemory, pid, req.id)
        if op == "memory_read":
            row.last_used_at = utc_now()
            result.memory = memory_read(row)
            return result
        if op == "memory_update":
            if secret_content(" ".join([req.subject, req.content, *req.tags])):
                raise MemoryError("sensitive_content_rejected")
            if row.revision != req.revision:
                raise MemoryError("revision_conflict")
            archive_revision(db, row, source, "correction")
            bump(db, VoiceMemory, row, req.revision)
            for field in ("subject", "content", "tags", "status", "pinned", "importance"):
                setattr(row, field, getattr(req, field))
            row.origin = "explicit"
            row.source_session_id = source
            row.search_text = normalize(" ".join([row.subject, row.content, *row.tags]))
            result.memory = memory_read(row)
            return result
        bump(db, VoiceMemory, row, req.revision)
        purge(db, pid, memory_id=row.id)
        db.execute(delete(VoiceMemoryRevision).where(VoiceMemoryRevision.memory_id == row.id))
        db.delete(row)
        return result
    if op == "note_create":
        if sum(len(i) for i in req.items) > 8000:
            raise MemoryError("invalid_arguments")
        if secret_content(" ".join([req.title, req.content or "", *req.items])):
            raise MemoryError("sensitive_content_rejected")
        now = utc_now()
        row = VoiceNote(
            id=uid(),
            principal_id=pid,
            title=req.title,
            normalized_title=normalize(req.title),
            kind=req.kind,
            content=req.content,
            status="active",
            revision=1,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        db.flush()
        for i, text in enumerate(req.items):
            db.add(VoiceNoteItem(id=uid(), note_id=row.id, content=text, position=i))
        db.flush()
        result.note = note_read(db, row)
        return result
    if op == "note_list":
        stmt = select(VoiceNote).where(
            VoiceNote.principal_id == pid,
            VoiceNote.status == "archived" if req.archived else VoiceNote.status == "active",
        )
        if req.query:
            stmt = stmt.where(
                VoiceNote.normalized_title.contains(normalize(req.query), autoescape=True)
            )
        rows = db.scalars(
            stmt.order_by(VoiceNote.updated_at.desc(), VoiceNote.id)
            .limit(req.limit + 1)
            .offset(req.offset)
        ).all()
        result.notes = [note_read(db, r, header=True) for r in rows[: req.limit]]
        result.has_more = len(rows) > req.limit
        if req.query and len(rows) > 1:
            result.code = "ambiguous"
        return result
    if op == "summary_read":
        result.summary = summary_read(owned(db, VoiceConversationSummary, pid, req.id))
        return result
    row = owned(db, VoiceNote, pid, req.id)
    if op == "note_read":
        result.note = note_read(db, row)
        return result
    bump(db, VoiceNote, row, req.revision)
    if op == "note_delete":
        purge(db, pid, note_id=row.id)
        db.execute(delete(VoiceNoteItem).where(VoiceNoteItem.note_id == row.id))
        db.delete(row)
        return result
    if op == "note_archive":
        row.status = "archived"
    elif op == "note_rename":
        if secret_content(req.title):
            raise MemoryError("sensitive_content_rejected")
        row.title = req.title
        row.normalized_title = normalize(req.title)
    elif op == "note_text_update":
        if row.kind != "text":
            raise MemoryError("invalid_arguments")
        if secret_content(req.content):
            raise MemoryError("sensitive_content_rejected")
        row.content = req.content
    else:
        if row.kind != "list":
            raise MemoryError("invalid_arguments")
        items = db.scalars(
            select(VoiceNoteItem)
            .where(VoiceNoteItem.note_id == row.id)
            .order_by(VoiceNoteItem.position)
            .limit(101)
        ).all()
        target = next((i for i in items if i.id == str(getattr(req, "item_id", None))), None)
        if op in {"note_item_remove", "note_item_update", "note_item_move"} and target is None:
            raise MemoryError("not_found")
        if op in {"note_item_add", "note_item_update"}:
            size = (
                sum(len(i.content) for i in items)
                + len(req.content)
                - (len(target.content) if target else 0)
            )
            if size > 8000:
                raise MemoryError("invalid_arguments")
        if op == "note_item_add":
            if len(items) >= 100 or secret_content(req.content):
                raise MemoryError("invalid_arguments")
            index = len(items) if req.position is None else req.position
            if index > len(items):
                raise MemoryError("invalid_arguments")
        if op == "note_item_move" and req.position >= len(items):
            raise MemoryError("invalid_arguments")
        # Move all live positions outside their original range before assigning the new ordering.
        db.execute(
            update(VoiceNoteItem)
            .where(VoiceNoteItem.note_id == row.id)
            .values(position=VoiceNoteItem.position + 1000)
            .execution_options(synchronize_session=False)
        )
        if op == "note_item_add":
            target = VoiceNoteItem(id=uid(), note_id=row.id, content=req.content, position=2000)
            db.add(target)
            items.insert(index, target)
        elif op == "note_item_remove":
            items.remove(target)
            db.delete(target)
        elif op == "note_item_update":
            if secret_content(req.content):
                raise MemoryError("sensitive_content_rejected")
            target.content = req.content
        elif op == "note_item_move":
            items.remove(target)
            items.insert(req.position, target)
        elif op == "note_clear":
            for item in items:
                db.delete(item)
            items = []
        db.flush()
        for i, item in enumerate(items):
            db.execute(
                update(VoiceNoteItem)
                .where(VoiceNoteItem.id == item.id)
                .values(position=i)
                .execution_options(synchronize_session=False)
            )
        db.expire_all()
    db.flush()
    result.note = note_read(db, row)
    return result


def purge(db, pid, *, memory_id=None, note_id=None):
    # Derivation edges are server supplied from every bounded source seen by the curator.
    edge = VoiceMemoryDependency
    initial = (
        select(edge.memory_id).where(edge.source_memory_id == memory_id)
        if memory_id
        else select(edge.memory_id).where(edge.source_note_id == note_id)
    )
    descendants = initial.cte("voice_memory_descendants", recursive=True)
    descendants = descendants.union(
        select(edge.memory_id).join(descendants, edge.source_memory_id == descendants.c.memory_id)
    )
    derived = select(VoiceMemory.id).where(
        VoiceMemory.principal_id == pid,
        VoiceMemory.origin == "automatic",
        VoiceMemory.id.in_(select(descendants.c.memory_id)),
        VoiceMemory.id != memory_id if memory_id else VoiceMemory.id.is_not(None),
    )
    ids = list(db.scalars(derived))
    if ids:
        db.execute(delete(VoiceMemoryRevision).where(VoiceMemoryRevision.memory_id.in_(ids)))
        db.execute(delete(edge).where(or_(edge.memory_id.in_(ids), edge.source_memory_id.in_(ids))))
        db.execute(
            delete(VoiceMemory).where(VoiceMemory.id.in_(ids), VoiceMemory.principal_id == pid)
        )
    db.execute(
        delete(edge).where(edge.source_memory_id == memory_id)
        if memory_id
        else delete(edge).where(edge.source_note_id == note_id)
    )
    # Summaries can paraphrase deleted facts without direct links. Clear the owner's summaries conservatively.
    db.execute(delete(VoiceConversationSummary).where(VoiceConversationSummary.principal_id == pid))
    db.execute(
        update(VoiceMemorySettings)
        .where(VoiceMemorySettings.principal_id == pid)
        .values(generation=VoiceMemorySettings.generation + 1)
    )


def execute(
    db: Session,
    pid: str,
    request: MemoryRequest,
    *,
    session_id: str | None = None,
    call_id: str | None = None,
    receipt_namespace: str = "standalone",
    _recovery: bool = False,
) -> MemoryResult:
    req = request.request
    identity = None
    digest = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
    if session_id and call_id:
        identity = hashlib.sha256(f"{pid}:{receipt_namespace}:{session_id}:{call_id}".encode()).hexdigest()
    try:
        if identity:
            receipt = db.get(VoiceMemoryOperation, identity) or db.scalar(select(VoiceMemoryOperation).where(VoiceMemoryOperation.principal_id == pid, VoiceMemoryOperation.receipt_namespace == receipt_namespace, VoiceMemoryOperation.session_id == session_id, VoiceMemoryOperation.call_id == call_id))
            if receipt:
                if receipt.arguments_digest != digest or receipt.operation != req.operation:
                    raise MemoryError("identity_conflict")
                result = MemoryResult(
                    operation=req.operation, code=receipt.result_code, replayed=True
                )
                if req.operation in {
                    "memory_search",
                    "memory_list",
                    "note_list",
                    "memory_read",
                    "note_read",
                    "summary_read",
                }:
                    result = apply(db, pid, req, session_id)
                    result.replayed = True
                    db.commit()
                    return result
                if receipt.entity_id:
                    cls = VoiceNote if req.operation.startswith("note_") else VoiceMemory
                    row = db.scalar(
                        select(cls).where(cls.id == receipt.entity_id, cls.principal_id == pid)
                    )
                    if row:
                        if cls is VoiceMemory:
                            result.memory = memory_read(row)
                        else:
                            result.note = note_read(db, row)
                return result
            receipt = VoiceMemoryOperation(
                id=identity,
                principal_id=pid,
                receipt_namespace=receipt_namespace,
                creator_namespace=receipt_namespace,
                session_id=session_id,
                call_id=call_id,
                operation=req.operation,
                arguments_digest=digest,
                result_code="ok",
                delivered=False,
                created_at=utc_now(),
            )
            db.add(receipt)
            db.flush()
        result = apply(db, pid, req, session_id)
        entity = result.memory or result.note or result.summary
        if entity:
            cls = VoiceNote if result.note else VoiceConversationSummary if result.summary else VoiceMemory
            stored = db.get(cls, entity.id)
            if stored and stored.creator_namespace is None:
                stored.creator_namespace = receipt_namespace
        if identity:
            receipt.result_code = result.code
            entity = result.memory or result.note or result.summary
            receipt.entity_id = entity.id if entity else None
            receipt.entity_revision = entity.revision if entity else None
        db.commit()
        return result
    except IntegrityError:
        db.rollback()
        if identity and not _recovery and db.get(VoiceMemoryOperation, identity):
            return execute(db, pid, request, session_id=session_id, call_id=call_id, receipt_namespace=receipt_namespace, _recovery=True)
        return MemoryResult(operation=req.operation, code="revision_conflict")
    except MemoryError as exc:
        db.rollback()
        return MemoryResult(operation=req.operation, code=str(exc))
    except SQLAlchemyError:
        db.rollback()
        return MemoryResult(operation=req.operation, code="unavailable")


def context(db, pid, budget=2000):
    layers = []
    pinned = db.scalars(
        select(VoiceMemory)
        .where(
            VoiceMemory.principal_id == pid,
            VoiceMemory.status == "active",
            VoiceMemory.pinned.is_(True),
        )
        .order_by(VoiceMemory.importance.desc(), VoiceMemory.updated_at.desc())
        .limit(5)
    ).all()
    recent = db.scalars(
        select(VoiceMemory)
        .where(
            VoiceMemory.principal_id == pid,
            VoiceMemory.status == "active",
            VoiceMemory.importance >= 5,
        )
        .order_by(
            case((VoiceMemory.kind.in_(["project", "open_point"]), 1), else_=0).desc(),
            VoiceMemory.importance.desc(),
            VoiceMemory.updated_at.desc(),
        )
        .limit(12)
    ).all()
    summaries = db.scalars(
        select(VoiceConversationSummary)
        .where(VoiceConversationSummary.principal_id == pid)
        .order_by(VoiceConversationSummary.updated_at.desc())
        .limit(3)
    ).all()
    notes = db.scalars(
        select(VoiceNote)
        .where(VoiceNote.principal_id == pid, VoiceNote.status == "active")
        .order_by(VoiceNote.updated_at.desc())
        .limit(8)
    ).all()
    seen = set()
    for row in [*pinned, *recent]:
        if row.id not in seen:
            layers.append(
                {
                    "type": "memory",
                    "id": row.id,
                    "revision": row.revision,
                    "kind": row.kind,
                    "subject": row.subject,
                    "content": row.content,
                }
            )
            seen.add(row.id)
    layers += [{"type": "summary", **summary_read(r).model_dump(mode="json")} for r in summaries]
    layers += [
        {"type": "note", "id": r.id, "title": r.title, "revision": r.revision} for r in notes
    ]
    from .token_budget import measure
    profile = db.get(VoiceMemory, PROFILE_ID)
    inventory = {
        "type": "inventory", "scope": SHARED_SPACE,
        "facts": db.scalar(select(func.count()).select_from(VoiceMemory).where(VoiceMemory.principal_id == pid, VoiceMemory.status == "active")),
        "notes": db.scalar(select(func.count()).select_from(VoiceNote).where(VoiceNote.principal_id == pid, VoiceNote.status == "active")),
        "summaries": db.scalar(select(func.count()).select_from(VoiceConversationSummary).where(VoiceConversationSummary.principal_id == pid)),
        "partial": True, "retrieval": "Use memory_list/search and note_list/read before claiming absence.",
    }
    selected = []
    if profile:
        selected.append({"type": "profile", "id": profile.id, "revision": profile.revision, "content": profile.content})
    selected.append(inventory)
    def encode(entries):
        return json.dumps({"memory_data": entries, "budget_unit": "compatible_token_estimate", "encoding": "o200k_base", "partial": True}, ensure_ascii=False, separators=(",", ":"))
    for entry in layers:
        if entry.get("id") == PROFILE_ID:
            continue
        candidate = encode([*selected, entry])
        if measure(candidate).tokens + 64 <= budget and len(candidate.encode("utf-8")) <= 24000:
            selected.append(entry)
    value = encode(selected)
    # Mandatory inventory/profile have a documented minimum budget; reject an impossible caller budget.
    if measure(value).tokens + 64 > budget or len(value.encode("utf-8")) > 24000:
        raise MemoryError("context_budget_too_small")
    db.commit()
    return value
