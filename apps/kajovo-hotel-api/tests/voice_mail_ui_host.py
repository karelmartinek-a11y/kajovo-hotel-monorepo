"""Real browser HTTP/auth/DB fixture; only paid provider media is isolated."""
import base64
import os
import uuid

from app.config import get_settings
from app.db.models import VoiceMailOperation
from app.db.session import SessionLocal
from app.main import create_app
from app.services.voice_smart import VoiceBridge, manager
from tests.test_voice_mail import draft, candidate
from tests.test_voice_registry import arm

get_settings().voice_master_key = base64.b64encode(os.urandom(32)).decode()
app = create_app()


async def create_fixture(sdp, config, key, owner, token):
    bridge = VoiceBridge(owner, "rtc_mail_browser", key, token, config, "gpt-realtime-2.1")
    bridge.ready.set()
    bridge.technologies = "unavailable"
    bridge.mail_state = "degraded"
    bridge.mail_accounts = [{"account": "reception", "email": "recepce@hotelchodovasc.cz", "display_name": "Recepce",
        "status": "unhealthy", "configured": False, "imap_connected": False, "smtp_authenticated": False, "index_ready": False,
        "indexed_messages": 0, "indexed_folders": 0, "last_sync_at": None, "error": "ACCOUNT_UNAVAILABLE"}]
    operation_id = uuid.uuid4().hex
    with SessionLocal() as db:
        db.add(VoiceMailOperation(id=operation_id, owner_session_id=owner, voice_session_id=bridge.id, call_id="fixture",
            tool="mail_send_prepare", digest="a" * 64, state="pending"))
        db.commit()
    d = draft()
    d["subject"] = "Dlouhý předmět " + "Žluťoučký" * 30
    d["text_body"] = "První odstavec celého e-mailu.\n\nDruhý odstavec s českými znaky."
    prepared = candidate(d)
    prepared["send_candidate_id"] = "candidate-" + uuid.uuid4().hex
    bridge.mail_confirmation.prepare(prepared, d, "cs", operation_id)
    arm(bridge.mail_confirmation)
    manager.sessions[bridge.id] = bridge
    return {"sdp": "v=0\r\nfixture", "model": bridge.model, **bridge.public_status(), "managed_functions": ["mail_send_prepare"]}


manager.create = create_fixture
