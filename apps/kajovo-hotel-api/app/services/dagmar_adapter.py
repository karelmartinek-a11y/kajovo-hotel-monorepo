"""Hotel → Dagmar infrastructure/auth adapter. No voice business implementation."""
from datetime import datetime, timezone
from sqlalchemy import select
from dagmar_server.application import DagmarApplication
from dagmar_server.ports import RuntimePorts
from dagmar_server.settings import DagmarSettings
from dagmar_server.migrations import upgrade
from app.config import get_settings
from app.db.models import AuthSession
from app.db.session import SessionLocal, engine
from app.security import auth
from app.services.voice_diagnostics import store


def verified_identity(session):
    if not session:
        return None
    identity = dict(session)
    identity['voice_authorized'] = session.get('actor_type') == 'admin' and session.get('role') == 'admin'
    identity['namespace'] = ('portal:' + str(session['portal_user_id'])) if session.get('portal_user_id') else 'admin-profile:1'
    return identity


def request_identity(request):
    with SessionLocal() as db:
        return verified_identity(auth._load_session(request, db))


def identity(owner):
    with SessionLocal() as db:
        record = db.scalar(select(AuthSession).where(AuthSession.session_id == owner))
        now = datetime.now(timezone.utc)
        config = get_settings()
        if not record or record.revoked_at or (auth._as_utc(record.expires_at) or now) <= now:
            return None
        if record.web_activity_session and (now-(auth._as_utc(record.last_activity_at) or now)).total_seconds() > config.web_session_idle_seconds:
            return None
        if record.portal_user_id and not auth._validate_portal_session(db, record):
            return None
        return verified_identity(auth._serialize_session(record))


def create_dagmar():
    config = get_settings()
    settings = DagmarSettings(**{name:getattr(config,name) for name in DagmarSettings.model_fields if name.startswith('voice_')},
        ha_mcp_token=config.kajavoiceha_mcp_token, mail_mcp_token=config.kajovo_mail_mcp_token,
        mail_mcp_url=config.kajovo_mail_mcp_url)
    return DagmarApplication(RuntimePorts(session_factory=SessionLocal, settings=settings, identity=identity, request_identity=request_identity), store)


def migrate():
    return upgrade(engine, import_legacy=True)
