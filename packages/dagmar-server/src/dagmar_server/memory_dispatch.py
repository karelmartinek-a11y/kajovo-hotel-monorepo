"""Explicit memory transport with durable host identities, without a fallback."""
import asyncio
import hashlib
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy.exc import IntegrityError

from . import memory
from .memory_contract import MemoryResult
from .models import VoiceMemoryOperation
from .models import VoiceMemorySettings
from .ports import runtime

READS = frozenset({'memory_search', 'memory_read', 'memory_list', 'note_list', 'note_read', 'summary_read'})


def receipt_identity(pid, namespace, session_id, call_id):
    return hashlib.sha256(f'{pid}:{namespace}:{session_id}:{call_id}'.encode()).hexdigest()


def operation_uuid(receipt_id):
    return str(uuid5(NAMESPACE_URL, 'dagmar-listecky-v1:' + receipt_id))


async def execute(db, pid, request, *, session_id=None, call_id=None, receipt_namespace='standalone'):
    connector = runtime().memory_connector
    if connector is None:
        # Explicit portable storage mode; a configured MCP connector never falls back.
        return memory.execute(db, pid, request, session_id=session_id, call_id=call_id, receipt_namespace=receipt_namespace)
    op = request.request.operation
    identity = None
    if op not in READS:
        session_id = session_id or 'http'
        call_id = call_id or str(uuid4())
        identity = receipt_identity(pid, receipt_namespace, session_id, call_id)
        digest = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        receipt = db.get(VoiceMemoryOperation, identity)
        if receipt is None:
            db.add(VoiceMemoryOperation(id=identity, principal_id=pid, receipt_namespace=receipt_namespace,
                creator_namespace=receipt_namespace, session_id=session_id, call_id=call_id,
                operation=op, arguments_digest=digest, result_code='unavailable', delivered=False,
                created_at=memory.utc_now()))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
            receipt = db.get(VoiceMemoryOperation, identity)
        if receipt is None:
            return MemoryResult(operation=op, code='unavailable')
        if receipt.arguments_digest != digest or receipt.operation != op:
            return MemoryResult(operation=op, code='identity_conflict')
    # Release the host transaction before network IO. The MCP receipt owns the mutation.
    db.commit()
    before_generation = db.get(VoiceMemorySettings, pid).generation
    db.commit()
    try:
        async with asyncio.timeout(20):
            result = MemoryResult.model_validate(await connector(request, operation_uuid(identity) if identity else None))
        if result.operation != op:
            raise ValueError('memory_result_operation_mismatch')
        db.expire_all()
        if (db.get(VoiceMemorySettings, pid).generation != before_generation and
                op not in {'memory_forget', 'note_delete', 'note_clear'}):
            return MemoryResult(operation=op, code='unavailable')
    except Exception:
        return MemoryResult(operation=op, code='unavailable')
    if identity:
        receipt = db.get(VoiceMemoryOperation, identity)
        receipt.result_code = result.code
        entity = result.memory or result.note or result.summary
        receipt.entity_id = entity.id if entity else None
        receipt.entity_revision = entity.revision if entity else None
        db.commit()
    return result
