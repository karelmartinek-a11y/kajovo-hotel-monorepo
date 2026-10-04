"""Application-owned coalesced refresh with an immediate forget barrier."""
import asyncio
from .ports import runtime, authorized, SessionLocal
from .models import VoiceMemorySettings

async def invalidate(pid, *, deleted=False, keep_call_id=None, keep_bridge_id=None):
    app = runtime().application
    if not deleted:
        previous = app.refreshes.get(pid)
        if previous and not previous.done():
            return
        async def refresh():
            await asyncio.sleep(0.05)
            await _apply(app, pid, False)
        task = asyncio.create_task(refresh())
        app.refreshes[pid] = task
        return
    pending = app.refreshes.pop(pid, None)
    if pending and not pending.done():
        pending.cancel()
    await _apply(app, pid, True, keep_call_id, keep_bridge_id)

async def _apply(app, pid, deleted, keep_call_id=None, keep_bridge_id=None):
    for bridge in list(app.manager.sessions.values()):
        if bridge.memory_principal != pid or bridge.closed or not authorized(bridge.owner):
            continue
        if deleted:
            bridge.memory_privacy_paused = True
            bridge.human_turns.turns.clear()
            bridge.curated_inputs.clear()
            if bridge.id != keep_bridge_id:
                bridge.turns.generation += 1
            if bridge.turns.active and bridge.ws:
                import json
                await bridge.ws.send(json.dumps({"type":"response.cancel", "response_id":bridge.turns.active}))
                await bridge.ws.send(json.dumps({"type":"output_audio_buffer.clear"}))
            bridge.turns.active = None
            bridge.mail_confirmation.invalidate()
            bridge.registry.invalidate()
        if bridge.memory_buffer:
            with SessionLocal() as db:
                config = db.get(VoiceMemorySettings, pid)
                enabled = bool(config and config.automatic and not bridge.memory_privacy_paused)
                if deleted or bridge.memory_buffer.enabled != enabled:
                    bridge.memory_buffer.reset(invalidate=True)
                bridge.memory_buffer.enabled = enabled
        if deleted:
            # Remove all provider dialogue which could paraphrase the forgotten data, including paired tool items.
            # A missing provider acknowledgment forces a fresh connection; do not permit stale continuation.
            targets = set(bridge.dialog_items) - {bridge.catalog_item} - (bridge.call_items.get(keep_call_id, set()) if keep_call_id and bridge.id == keep_bridge_id else set())
            for iid in targets:
                try:
                    await bridge.delete_item(iid)
                    bridge.protected_items.discard(iid)
                    bridge.memory_outputs.discard(iid)
                    if iid in bridge.dialog_items:
                        bridge.dialog_items.remove(iid)
                except Exception:
                    bridge.renew = True
            bridge.call_items.clear()
        await bridge.refresh_memory_context()
        await bridge.update_transcription()
