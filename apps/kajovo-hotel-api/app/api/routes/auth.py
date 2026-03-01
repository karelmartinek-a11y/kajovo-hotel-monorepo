import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import (
    AdminLoginRequest,
    AuthIdentityResponse,
    ForgotPasswordRequest,
    LogoutResponse,
    PortalLoginRequest,
    SelectRoleRequest,
)
from app.config import get_settings
from app.db.models import AuthLockoutState, AuthUnlockToken, PortalSmtpSettings, PortalUser
from app.db.session import get_db
from app.security.auth import (
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    cookie_secure,
    create_session_cookie,
    get_permissions,
    require_session,
)
from app.security.rbac import normalize_role
from app.services.mail import (
    StoredSmtpConfig,
    build_email_service,
    send_admin_unlock_link,
    send_user_unlock_link,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
LOCKOUT_THRESHOLD = 3
LOCKOUT_WINDOW = timedelta(hours=1)
PORTAL_LOCKOUT_DURATION = timedelta(hours=1)
ADMIN_LOCKOUT_DURATION = timedelta(days=36500)
UNLOCK_TOKEN_TTL = timedelta(hours=24)
FORGOT_THROTTLE = timedelta(hours=1)

LOCKOUT_THRESHOLD = 3
LOCKOUT_WINDOW = timedelta(hours=1)
LOCKOUT_DURATION = timedelta(hours=1)
FORGOT_THROTTLE = timedelta(hours=1)
UNLOCK_TOKEN_TTL = timedelta(hours=24)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class HintRequest(BaseModel):
    email: str


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash.startswith("scrypt$"):
        return False
    _, salt_hex, digest_hex = stored_hash.split("$", 2)
    calc = hashlib.scrypt(
        password.encode("utf-8"),
        salt=bytes.fromhex(salt_hex),
        n=2**14,
        r=8,
        p=1,
    )
    return secrets.compare_digest(calc.hex(), digest_hex)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def _get_lockout_state(
    db: Session,
    *,
    actor_type: str,
    principal: str,
    create: bool = True,
) -> AuthLockoutState | None:
    state = db.execute(
        select(AuthLockoutState).where(
            AuthLockoutState.actor_type == actor_type,
            AuthLockoutState.principal == principal,
        )
    ).scalar_one_or_none()
    if state is None and create:
        state = AuthLockoutState(actor_type=actor_type, principal=principal)
        db.add(state)
        db.flush()
    return state


def _is_locked(state: AuthLockoutState | None, now: datetime) -> bool:
    if state is None or state.locked_until is None:
        return False
    return (_as_utc(state.locked_until) or now) > now


def _reset_lock_state(state: AuthLockoutState | None) -> None:
    if state is None:
        return
    state.failed_attempts = 0
    state.first_failed_at = None
    state.last_failed_at = None
    state.locked_until = None


def _record_failed_login(
    state: AuthLockoutState,
    *,
    now: datetime,
    lock_duration: timedelta,
) -> bool:
    first_failed_at = _as_utc(state.first_failed_at)
    window_reset = first_failed_at is None or now - first_failed_at > LOCKOUT_WINDOW
    was_locked = _is_locked(state, now)
    if window_reset:
        state.failed_attempts = 0
        state.first_failed_at = now
    state.failed_attempts = int(state.failed_attempts or 0) + 1
    state.last_failed_at = now
    if state.failed_attempts >= LOCKOUT_THRESHOLD:
        state.locked_until = now + lock_duration
    return (not was_locked) and _is_locked(state, now)


def _stored_smtp_config(db: Session) -> StoredSmtpConfig | None:
    record = db.get(PortalSmtpSettings, 1)
    if record is None:
        return None
    return StoredSmtpConfig(
        host=record.host,
        port=record.port,
        username=record.username,
        use_tls=record.use_tls,
        use_ssl=record.use_ssl,
        password_encrypted=record.password_encrypted,
    )


def _issue_unlock_token(
    db: Session,
    *,
    actor_type: str,
    principal: str,
    now: datetime,
) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    db.add(
        AuthUnlockToken(
            actor_type=actor_type,
            principal=principal,
            token_hash=token_hash,
            expires_at=now + UNLOCK_TOKEN_TTL,
        )
    )
    return token


def _build_unlock_link(*, request: Request | None, token: str, actor_type: str) -> str:
    query = urlencode({"token": token, "actor_type": actor_type})
    if request is not None:
        return f"{str(request.base_url).rstrip('/')}/api/auth/unlock?{query}"
    return f"https://hotel.hcasc.cz/api/auth/unlock?{query}"


def _send_unlock_email(
    db: Session,
    *,
    request: Request | None,
    actor_type: str,
    principal: str,
) -> None:
    settings = get_settings()
    token = _issue_unlock_token(db, actor_type=actor_type, principal=principal, now=_utc_now())
    unlock_link = _build_unlock_link(request=request, token=token, actor_type=actor_type)
    try:
        service = build_email_service(settings, _stored_smtp_config(db))
        if actor_type == "admin":
            send_admin_unlock_link(service=service, recipient=principal, unlock_link=unlock_link)
        else:
            send_user_unlock_link(service=service, recipient=principal, unlock_link=unlock_link)
    except Exception:
        # Login flow must remain deterministic even when SMTP transport is unavailable.
        pass


@router.post("/admin/login", response_model=AuthIdentityResponse)
def admin_login(
    payload: AdminLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    settings = get_settings()
    now = _utc_now()
    principal = settings.admin_email.strip().lower()
    state = _get_lockout_state(db, actor_type="admin", principal=principal)
    provided_email = payload.email.strip().lower()
    valid = provided_email == principal and payload.password == settings.admin_password
    if _is_locked(state, now):
        valid = False
    if (
        not valid
    ):
        became_locked = _record_failed_login(
            state,
            now=now,
            lock_duration=ADMIN_LOCKOUT_DURATION,
        )
        if became_locked:
            _send_unlock_email(db, request=request, actor_type="admin", principal=principal)
        db.add(state)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    _reset_lock_state(state)
    db.add(state)
    db.commit()
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(settings.admin_email, "admin", "admin", roles=["admin"], active_role="admin"),
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        httponly=False,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )
    return AuthIdentityResponse(
        email=settings.admin_email,
        role="admin",
        roles=["admin"],
        active_role="admin",
        permissions=get_permissions("admin"),
        actor_type="admin",
    )


@router.post("/admin/logout", response_model=LogoutResponse)
def admin_logout(response: Response) -> LogoutResponse:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return LogoutResponse()


@router.post("/admin/hint", response_model=LogoutResponse)
def admin_hint(
    payload: HintRequest,
    request: Request = None,  # type: ignore[assignment]
    db: Session = Depends(get_db),
) -> LogoutResponse:
    settings = get_settings()
    principal = settings.admin_email.strip().lower()
    if payload.email.strip().lower() != principal:
        return LogoutResponse()
    state = _get_lockout_state(db, actor_type="admin", principal=principal)
    now = _utc_now()
    last_sent_at = _as_utc(state.last_forgot_sent_at)
    if last_sent_at is None or now - last_sent_at >= FORGOT_THROTTLE:
        _send_unlock_email(db, request=request, actor_type="admin", principal=principal)
        state.last_forgot_sent_at = now
    db.add(state)
    db.commit()
    return LogoutResponse()


@router.post("/login", response_model=AuthIdentityResponse)
def portal_login(
    payload: PortalLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    email = payload.email.strip().lower()
    now = _utc_now()
    state = _get_lockout_state(db, actor_type="portal", principal=email)
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    is_valid = (
        not _is_locked(state, now)
        and user is not None
        and user.is_active
        and _verify_password(payload.password, user.password_hash)
    )
    if not is_valid:
        became_locked = _record_failed_login(
            state,
            now=now,
            lock_duration=PORTAL_LOCKOUT_DURATION,
        )
        if became_locked and user is not None and user.is_active:
            _send_unlock_email(db, request=request, actor_type="portal", principal=email)
        db.add(state)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user = db.execute(
        select(PortalUser)
        .options(selectinload(PortalUser.roles))
        .where(PortalUser.email == email)
    ).scalar_one_or_none()
    if user is None or not user.is_active or not _verify_password(payload.password, user.password_hash):
        _record_failed_login(db, "portal", email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    _clear_lockout(db, "portal", email)

    roles = list(dict.fromkeys(normalize_role(item.role) for item in user.roles))
    if not roles:
        roles = ["recepce"]
    active_role = roles[0] if len(roles) == 1 else None
    role = active_role or roles[0]

    _reset_lock_state(state)
    db.add(state)
    db.commit()
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    roles = [normalize_role(role.role) for role in user.roles]
    if not roles:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    role = roles[0]
    active_role = role if len(roles) == 1 else None
    permissions = get_permissions(active_role) if active_role else []
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(email, role, "portal", roles=roles, active_role=active_role),
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        httponly=False,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )
    return AuthIdentityResponse(
        email=email,
        role=role,
        roles=roles,
        active_role=active_role,
        permissions=permissions,
        actor_type="portal",
    )


@router.post("/forgot-password", response_model=LogoutResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    email = payload.email.strip().lower()
    state = _get_lockout_state(db, actor_type="portal", principal=email)
    now = _utc_now()
    if _is_locked(state, now):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account locked")
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    last_sent_at = _as_utc(state.last_forgot_sent_at)
    if user is not None and user.is_active and (
        last_sent_at is None or now - last_sent_at >= FORGOT_THROTTLE
    ):
        _send_unlock_email(db, request=request, actor_type="portal", principal=email)
        state.last_forgot_sent_at = now
    db.add(state)
    db.commit()
    return LogoutResponse()


@router.post("/logout", response_model=LogoutResponse)
def portal_logout(response: Response) -> LogoutResponse:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return LogoutResponse()


@router.get("/unlock", response_model=LogoutResponse)
def unlock_account(
    token: str,
    actor_type: str,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    if len(token.strip()) < 16:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    if actor_type not in {"admin", "portal"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid actor type")
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    record = db.execute(
        select(AuthUnlockToken).where(
            AuthUnlockToken.actor_type == actor_type,
            AuthUnlockToken.token_hash == token_hash,
            AuthUnlockToken.used_at.is_(None),
        )
    ).scalar_one_or_none()
    now = _utc_now()
    if record is None or (_as_utc(record.expires_at) or now) <= now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    state = _get_lockout_state(db, actor_type=actor_type, principal=record.principal, create=False)
    _reset_lock_state(state)
    record.used_at = now
    if state is not None:
        db.add(state)
    db.add(record)
    db.commit()
    return LogoutResponse()


@router.get("/me", response_model=AuthIdentityResponse)
def auth_me(request: Request) -> AuthIdentityResponse:
    session = require_session(request)
    role = session["role"]
    roles = [str(item) for item in session.get("roles", [role])]
    active_role = str(session["active_role"]) if session.get("active_role") else None
    permissions = get_permissions(active_role) if active_role else []
    return AuthIdentityResponse(
        email=str(session["email"]),
        role=role,
        roles=roles,
        active_role=active_role,
        permissions=permissions,
        actor_type=session["actor_type"],
    )


@router.post("/select-role", response_model=AuthIdentityResponse)
def select_portal_role(
    payload: SelectRoleRequest,
    request: Request,
    response: Response,
) -> AuthIdentityResponse:
    session = require_session(request)
    role = str(session["role"])
    roles = [str(item) for item in session.get("roles", [role])]
    selected_role = normalize_role(payload.role)
    if selected_role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role not assigned")
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(
            str(session["email"]),
            role,
            str(session["actor_type"]),
            roles=roles,
            active_role=selected_role,
        ),
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )
    return AuthIdentityResponse(
        email=str(session["email"]),
        role=role,
        roles=roles,
        active_role=selected_role,
        permissions=get_permissions(selected_role),
        actor_type=str(session["actor_type"]),
    )
