"""Observe the shared store, including commits made by independent MCP clients."""
import asyncio
import hashlib

from sqlalchemy import select, func

from .models import VoiceMemorySettings, VoiceMemory, VoiceNote, VoiceConversationSummary
from .ports import SessionLocal, runtime


def stamp(pid):
    with SessionLocal() as db:
        config = db.get(VoiceMemorySettings, pid)
        if config is None:
            raise ValueError('memory_settings_missing')
        generation = config.generation
        rows = [(config.revision, config.automatic)]
        for cls in (VoiceMemory, VoiceNote, VoiceConversationSummary):
            rows.append(tuple(db.execute(select(func.count(), func.sum(cls.revision), func.max(cls.updated_at)).where(cls.principal_id == pid)).one()))
        db.refresh(config)
        if generation != config.generation:
            raise ValueError('memory_changed_during_read')
        return generation, hashlib.sha256(repr(rows).encode()).hexdigest(), config.revision


def epoch(pid):
    with SessionLocal() as db:
        row = db.execute(select(VoiceMemorySettings.generation, VoiceMemorySettings.revision).where(VoiceMemorySettings.principal_id == pid)).one()
        return row[0], None, row[1]


def privacy_changed(previous, current):
    if previous is None or previous[0] is None or previous[0] == current[0]:
        return False
    # Setting changes increment both counters; purge increments generation only.
    # Unknown or regressing counters fail closed.
    if previous[2] is None:
        return True
    delta = current[0] - previous[0]
    return delta < 0 or delta != current[2] - previous[2]


def fence(bridge):
    bridge.task_context.clear()
    bridge.task_context.memory_privacy_paused = True
    bridge.memory_privacy_paused = True
    bridge.turns.generation += 1
    bridge.human_turns.generation = bridge.turns.generation
    if bridge.memory_buffer:
        bridge.memory_buffer.enabled = False
        bridge.memory_buffer.reset(invalidate=True)


async def synchronize(bridge):
    pid = getattr(bridge, 'memory_principal', None) or getattr(getattr(bridge, 'task_context', None), 'memory_principal', None)
    if not pid:
        return
    app = runtime().application
    lock = app.memory_sync_locks.setdefault(pid, asyncio.Lock())
    async with lock:
        current = stamp(pid)
        previous = app.memory_stamps.get(pid)
        saved_generation = getattr(bridge.task_context, 'memory_generation', None)
        saved = (saved_generation, None, getattr(bridge.task_context, 'memory_settings_revision', None))
        deleted = privacy_changed(previous, current) or privacy_changed(saved, current)
        if deleted or (previous is not None and previous != current):
            from .invalidation import invalidate
            await invalidate(pid, deleted=deleted)
        app.memory_stamps[pid] = current
        bridge.task_context.memory_generation = current[0]
        bridge.task_context.memory_settings_revision = current[2]
