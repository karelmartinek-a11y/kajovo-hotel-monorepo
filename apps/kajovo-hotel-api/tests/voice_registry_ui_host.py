"""Isolated browser fixture: real HTTP/auth/DB, synthetic provider port, no paid calls."""
import base64
import os
from datetime import timedelta

from app.config import get_settings
from app.main import create_app
from app.services.voice_smart import VoiceBridge, manager
from app.time_utils import utc_now

get_settings().voice_master_key = base64.b64encode(os.urandom(32)).decode()
app = create_app()


async def create_fixture(sdp, config, key, owner, token):
    bridge = VoiceBridge(owner, "rtc_browser_fixture", key, token, config, "gpt-realtime-2.1")
    bridge.catalog_ready = True
    bridge.technologies = "ready"
    bridge.ready.set()
    bridge.registry.prepare({"id": "plan-browser", "expires_at": (utc_now() + timedelta(minutes=5)).isoformat(),
        "requires_confirmation": True, "changes": [
            {"action": "rename_room", "room_ref": "room-public-a", "old_name": "Zkušební místnost s dlouhým názvem " + "A" * 100, "new_name": "Nová testovací místnost", "status": "planned"},
            {"action": "delete_room", "room_ref": "room-public-b", "old_name": "Druhá testovací místnost", "status": "planned"},
            {"action": "delete_room", "room_ref": "room-public-c", "old_name": "Chráněná testovací místnost", "status": "protected_members"},
            {"action": "rename_devices", "row": 89, "old_name": "Stejné světlo", "old_location": "Testovna A", "new_name": "Nové světlo 1", "status": "planned"},
            {"action": "rename_devices", "row": 90, "old_name": "Stejné světlo", "old_location": "Testovna B", "new_name": "Nové světlo 2", "status": "planned"},
        ]}, "cs")
    bridge.registry.begin_readback("readback-fixture")
    bridge.registry.event({"type": "response.done", "response": {"id": "readback-fixture", "status": "completed",
        "output": [{"content": [{"type": "audio", "transcript": bridge.registry.text}]}]}})
    bridge.registry.event({"type": "output_audio_buffer.stopped", "response_id": "readback-fixture"})
    manager.sessions[bridge.id] = bridge
    return {"sdp": "v=0\r\nfixture", "model": bridge.model, **bridge.public_status(), "managed_functions": ["smart_technologie", "assistant_memory"]}


manager.create = create_fixture
