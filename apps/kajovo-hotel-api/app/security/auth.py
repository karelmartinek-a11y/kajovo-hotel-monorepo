import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import AuthSession, PortalUser
from app.db.session import SessionLocal
from app.security.rbac import ROLE_PERMISSIONS, normalize_role
from app.time_utils import UTC, utc_after, utc_now, utc_timestamp

SESSION_COOKIE_NAME = "kajovo_session"
CSRF_COOKIE_NAME = "kajovo_csrf"
CSRF_HEADER_NAME = "x-csrf-token"
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
SESSION_STATE_KEY = "_kajovo_auth_session"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _secret_key() -> bytes:
    raw = os.getenv("KAJOVO_API_SESSION_SECRET", "kajovo-dev-session-secret")
    return raw.encode("utf-8")


def _sign(raw: bytes) -> str:
    digest = hmac.new(_secret_key(), raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def create_session_cookie(session_id: str, max_age_seconds: int | None = None) -> str:
    payload: dict[str, str | int] = {
        "sid": session_id,
        "iat": utc_timestamp(),
    }
    if max_age_seconds is not None:
        payload["exp"] = utc_timestamp(utc_after(seconds=max_age_seconds))
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    body = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    return f"{body}.{_sign(raw)}"


def read_session_cookie(cookie_value: str | None) -> dict[str, str] | None:
    if not cookie_value or "." not in cookie_value:
        return None
    body, signature = cookie_value.split(".", 1)
    padded = body + "=" * (-len(body) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode("utf-8"))
    except Exception:
        return None
    if not hmac.compare_digest(_sign(raw), signature):
        return None
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    exp_value = data.get("exp")
    if exp_value is not None:
        try:
            expires_at = datetime.fromtimestamp(float(exp_value), tz=UTC)
        except (TypeError, ValueError, OSError, OverflowError):
            return None
        if utc_now() >= expires_at:
            return None
    session_id = str(data.get("sid", "")).strip()
    if len(session_id) < 16:
        return None
    return {"session_id": session_id}


def _serialize_session(record: AuthSession) -> dict[str, str | list[str] | int | None]:
    return {
        "session_id": record.session_id,
        "email": record.principal,
        "role": record.role,
        "roles": [normalize_role(role) for role in record.roles],
        "active_role": normalize_role(record.active_role) if record.active_role else None,
        "actor_type": record.actor_type,
        "portal_user_id": record.portal_user_id,
    }


def _revoke_session_record(db: Session, record: AuthSession, *, now: datetime | None = None) -> None:
    if record.revoked_at is not None:
        return
    record.revoked_at = now or _utc_now()
    record.updated_at = record.revoked_at
    db.add(record)
    db.commit()


def _validate_portal_session(db: Session, record: AuthSession) -> bool:
    if record.portal_user_id is None:
        return False
    user = db.get(PortalUser, record.portal_user_id)
    if user is None or not user.is_active:
        return False
    current_roles = [normalize_role(role.role) for role in user.roles]
    if user.email.strip().lower() != record.principal.strip().lower():
        return False
    if record.actor_type == "admin":
        return "admin" in current_roles
    if record.actor_type != "portal":
        return False

    current_portal_roles = [role for role in current_roles if role != "admin"]
    stored_roles = [normalize_role(role) for role in record.roles]
    if not current_portal_roles:
        return False
    if sorted(current_portal_roles) != sorted(stored_roles):
        return False
    if record.active_role and normalize_role(record.active_role) not in current_portal_roles:
        return False
    return True


def _load_session(request: Request, db: Session) -> dict[str, str | list[str] | int | None] | None:
    parsed = read_session_cookie(request.cookies.get(SESSION_COOKIE_NAME))
    if not parsed:
        return None

    record = db.execute(
        select(AuthSession).where(AuthSession.session_id == parsed["session_id"])
    ).scalar_one_or_none()
    if record is None:
        return None

    now = _utc_now()
    expires_at = _as_utc(record.expires_at) or now
    revoked_at = _as_utc(record.revoked_at)
    if revoked_at is not None or expires_at <= now:
        if revoked_at is None:
            _revoke_session_record(db, record, now=now)
        return None

    if record.portal_user_id is not None and not _validate_portal_session(db, record):
        _revoke_session_record(db, record, now=now)
        return None

    record.last_seen_at = now
    db.add(record)
    db.commit()
    db.refresh(record)
    return _serialize_session(record)


def create_session_record(
    db: Session,
    *,
    principal: str,
    role: str,
    actor_type: str,
    roles: list[str] | None = None,
    active_role: str | None = None,
    portal_user_id: int | None = None,
    max_age_seconds: int | None = None,
) -> AuthSession:
    normalized_roles = [normalize_role(item) for item in (roles or [role])]
    expires_at = _utc_now() + timedelta(seconds=max_age_seconds or get_settings().session_max_age_seconds)
    record = AuthSession(
        session_id=secrets.token_urlsafe(32),
        actor_type=actor_type,
        principal=principal.strip().lower(),
        portal_user_id=portal_user_id,
        role=normalize_role(role),
        active_role=normalize_role(active_role) if active_role else None,
        expires_at=expires_at,
        last_seen_at=_utc_now(),
    )
    record.roles = normalized_roles
    db.add(record)
    db.flush()
    return record


def require_session(
    request: Request,
    db: Session | None = None,
) -> dict[str, str | list[str] | int | None]:
    cached = getattr(request.state, SESSION_STATE_KEY, None)
    if isinstance(cached, dict):
        return cached

    owns_db = db is None
    session_db = db or SessionLocal()
    try:
        session = _load_session(request, session_db)
    finally:
        if owns_db:
            session_db.close()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    setattr(request.state, SESSION_STATE_KEY, session)
    return session


def revoke_session_by_id(db: Session, session_id: str | None) -> None:
    if not session_id:
        return
    record = db.execute(
        select(AuthSession).where(AuthSession.session_id == session_id)
    ).scalar_one_or_none()
    if record is None:
        return
    _revoke_session_record(db, record)


def revoke_sessions_for_portal_user(db: Session, user_id: int) -> None:
    records = db.scalars(
        select(AuthSession).where(
            AuthSession.portal_user_id == user_id,
            AuthSession.revoked_at.is_(None),
        )
    ).all()
    if not records:
        return
    now = _utc_now()
    for record in records:
        record.revoked_at = now
        record.updated_at = now
        db.add(record)
    db.flush()


def revoke_sessions_for_principal(db: Session, actor_type: str, principal: str) -> None:
    records = db.scalars(
        select(AuthSession).where(
            AuthSession.actor_type == actor_type,
            AuthSession.principal == principal.strip().lower(),
            AuthSession.revoked_at.is_(None),
        )
    ).all()
    if not records:
        return
    now = _utc_now()
    for record in records:
        record.revoked_at = now
        record.updated_at = now
        db.add(record)
    db.flush()


def set_active_role(db: Session, session_id: str, active_role: str | None) -> AuthSession | None:
    record = db.execute(
        select(AuthSession).where(AuthSession.session_id == session_id)
    ).scalar_one_or_none()
    if record is None or record.revoked_at is not None:
        return None
    record.active_role = normalize_role(active_role) if active_role else None
    record.updated_at = _utc_now()
    db.add(record)
    db.flush()
    return record


def ensure_csrf(request: Request) -> None:
    if request.method not in WRITE_METHODS:
        return
    if request.url.path.startswith("/api/v1/device/"):
        return
    if request.url.path.startswith("/api/auth/") and request.url.path.endswith("/login"):
        return
    if request.url.path in {"/api/auth/admin/hint", "/api/auth/reset-password"}:
        return
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get(CSRF_HEADER_NAME)
    if (
        not cookie_token
        or not header_token
        or not secrets.compare_digest(cookie_token, header_token)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed",
        )


def get_permissions(role: str) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(normalize_role(role), set()))


def cookie_secure() -> bool:
    return get_settings().environment.lower() == "production"

