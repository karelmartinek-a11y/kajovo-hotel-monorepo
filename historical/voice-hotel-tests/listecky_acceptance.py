"""Read-only deployed transport/content comparison; emits counts and digests only."""
import asyncio
import hashlib
import json

from sqlalchemy import select

from app.config import get_settings
from app.db.session import SessionLocal
from app.services.listecky_mcp import ListeckyMemory
from dagmar_server import memory
from dagmar_server.memory_contract import MemoryRequest
from dagmar_server.models import VoiceMemoryPrincipal, VoiceMemory, VoiceNote


async def verify():
    config = get_settings()
    if not config.voice_memory_mcp_enabled:
        raise ValueError('memory_mcp_not_enabled')
    connector = ListeckyMemory(config.voice_memory_mcp_authorization)
    async def call(operation, **fields):
        result = await connector(MemoryRequest.model_validate({'request': {'operation':operation, **fields}}), None)
        if result.code != 'ok':
            raise ValueError('memory_acceptance_' + result.code)
        return result
    actual_memories, actual_notes = [], []
    for offset in range(0, 10001, 50):
        result = await call('memory_list', status=None, limit=50, offset=offset)
        actual_memories.extend(result.memories)
        if not result.has_more:
            break
    else:
        raise ValueError('memory_inventory_incomplete')
    for archived in (False, True):
        for offset in range(0, 10001, 50):
            result = await call('note_list', query='', archived=archived, limit=50, offset=offset)
            for header in result.notes:
                actual_notes.append((await call('note_read', id=header.id)).note)
            if not result.has_more:
                break
        else:
            raise ValueError('note_inventory_incomplete')
    with SessionLocal() as db:
        pid = db.scalar(select(VoiceMemoryPrincipal.id).where(VoiceMemoryPrincipal.namespace == memory.SHARED_SPACE))
        expected_memories = [memory.memory_read(row) for row in db.scalars(select(VoiceMemory).where(VoiceMemory.principal_id == pid))]
        expected_notes = [memory.note_read(db, row) for row in db.scalars(select(VoiceNote).where(VoiceNote.principal_id == pid))]
    def digest(rows):
        return hashlib.sha256(json.dumps(sorted((row.model_dump(mode='json') for row in rows), key=lambda row:row['id']), sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    if digest(actual_memories) != digest(expected_memories) or digest(actual_notes) != digest(expected_notes):
        raise ValueError('memory_shared_content_mismatch')
    return {'code':'ok', 'transport':'https://listecky.hcasc.cz/mcp', 'memories':len(actual_memories), 'notes':len(actual_notes),
            'memory_digest':digest(actual_memories), 'note_digest':digest(actual_notes), 'full_content_equal':True,
            'release_sha':config.voice_release_sha}


if __name__ == '__main__':
    try:
        print(json.dumps(asyncio.run(verify()), sort_keys=True))
    except Exception:
        raise SystemExit('Lístečky read-only transport/content acceptance failed') from None
