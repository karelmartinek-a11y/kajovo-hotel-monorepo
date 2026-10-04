"""Hotel infrastructure adapter for portable diagnostic storage.

No content is emitted to logging/audit. A bounded worker keeps disk IO outside
Realtime processing. Collection failures never terminate a voice connection.
"""
from functools import lru_cache
from pathlib import Path

from dagmar_server.collector import Collector as Collector
from dagmar_server.diagnostics import Diagnostics
from fastapi import HTTPException, Request

from app.config import get_settings
from app.security import auth as host_auth


@lru_cache(maxsize=1)
def store():
    config = get_settings()
    if not config.voice_diagnostic_root:
        raise HTTPException(503, detail={"code": "diagnostics_unavailable"})
    key = ""
    if config.voice_diagnostic_key_file:
        try:
            key = Path(config.voice_diagnostic_key_file).read_text().strip()
        except OSError:
            pass
    return Diagnostics(config.voice_diagnostic_root, key, release=config.voice_release_sha)


def authorize(request: Request):
    # Streaming export and chunk completion must revalidate current revocation;
    # require_session caches within one HTTP request, so use the live host loader.
    with host_auth.SessionLocal() as db:
        session = host_auth._load_session(request, db)
    if not session:
        raise HTTPException(401, detail={"code":"unauthorized"})
    if session.get("actor_type") != "admin" or session.get("role") != "admin":
        raise HTTPException(403, detail={"code": "voice_permission_required"})
    return str(session["session_id"])
