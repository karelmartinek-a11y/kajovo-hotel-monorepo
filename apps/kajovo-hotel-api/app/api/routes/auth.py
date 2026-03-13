import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import (
    AdminLoginRequest,
    AuthIdentityResponse,
    AuthProfileRead,
    AuthProfileUpdate,
    ForgotPasswordRequest,
    LogoutResponse,
    PortalLoginRequest,
    PortalPasswordChangeRequest,
    SelectRoleRequest,
)
from app.config import get_settings
from app.db.models import (
    AdminProfile,
    AuthLockoutState,
    AuthUnlockToken,
    PortalSmtpSettings,
    PortalUser,
)
from app.db.session import get_db
from app.security.auth import (
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    cookie_secure,
    create_session_cookie,
    create_session_record,
    get_permissions,
    read_session_cookie,
    require_session,
    revoke_session_by_id,
    revoke_sessions_for_portal_user,
    set_active_role,
)
from app.security.passwords import hash_password, verify_password
from app.security.rbac import normalize_role
from app.services.admin_credentials import ensure_admin_profile
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


def _get_lockout_state(
    db: Session,
    *,
    actor_type: str,
    principal: str,
    create: bool = True,
) -> AuthLockoutState | None:
    states = (
        db.execute(
        select(AuthLockoutState).where(
            AuthLockoutState.actor_type == actor_type,
            AuthLockoutState.principal == principal,
        )
        .order_by(AuthLockoutState.id.asc())
        )
        .scalars()
        .all()
    )
    state = states[0] if states else None
    if state is None and create:
        state = AuthLockoutState(actor_type=actor_type, principal=principal)
        db.add(state)
        db.flush()
        return state
    if state is not None and len(states) > 1:
        duplicates = states[1:]
        state.failed_attempts = max(int(item.failed_attempts or 0) for item in states)
        first_failed_values = [_as_utc(item.first_failed_at) for item in states if item.first_failed_at]
        last_failed_values = [_as_utc(item.last_failed_at) for item in states if item.last_failed_at]
        locked_until_values = [_as_utc(item.locked_until) for item in states if item.locked_until]
        forgot_values = [_as_utc(item.last_forgot_sent_at) for item in states if item.last_forgot_sent_at]
        state.first_failed_at = min(first_failed_values) if first_failed_values else None
        state.last_failed_at = max(last_failed_values) if last_failed_values else None
        state.locked_until = max(locked_until_values) if locked_until_values else None
        state.last_forgot_sent_at = max(forgot_values) if forgot_values else None
        db.add(state)
        for duplicate in duplicates:
            db.delete(duplicate)
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


def _is_admin_user(user: PortalUser) -> bool:
    return any(normalize_role(role.role) == "admin" for role in user.roles)


def _portal_roles_for_user(user: PortalUser) -> list[str]:
    return [normalize_role(role.role) for role in user.roles if normalize_role(role.role) != "admin"]


def _find_admin_user(db: Session, email: str) -> PortalUser | None:
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if user is None or not user.is_active or not _is_admin_user(user):
        return None
    return user


def _current_user_from_session(request: Request, db: Session) -> tuple[dict[str, object], PortalUser]:
    session = require_session(request, db)
    portal_user_id = session.get("portal_user_id")
    if portal_user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    user = db.get(PortalUser, int(portal_user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return session, user


def _profile_response(session: dict[str, object], user: PortalUser) -> AuthProfileRead:
    return AuthProfileRead(
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        note=user.note,
        roles=[normalize_role(role.role) for role in user.roles],
        actor_type=str(session["actor_type"]),
    )


@router.post("/admin/login", response_model=AuthIdentityResponse)
def admin_login(
    payload: AdminLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    settings = get_settings()
    now = _utc_now()
    admin_profile = ensure_admin_profile(db, settings, sync_from_env=False)
    provided_email = payload.email.strip().lower()
    principal = provided_email or admin_profile.email.strip().lower()
    state = _get_lockout_state(db, actor_type="admin", principal=principal)
    admin_user = _find_admin_user(db, provided_email)
    valid_env_login = (
        provided_email == admin_profile.email.strip().lower()
        and verify_password(payload.password, admin_profile.password_hash)
    )
    valid_portal_admin_login = admin_user is not None and verify_password(
        payload.password,
        admin_user.password_hash,
    )
    valid = valid_env_login or valid_portal_admin_login
    if valid:
        _reset_lock_state(state)
    elif _is_locked(state, now):
        raise HTTPException(status_code=status.HTTP_423_LOCKED, detail="Account locked")
    if not valid:
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
    portal_user_id = admin_user.id if valid_portal_admin_login and admin_user is not None else None
    if admin_user is not None and portal_user_id is not None:
        admin_user.last_login_at = now
        db.add(admin_user)
    session_record = create_session_record(
        db,
        principal=principal,
        role="admin",
        actor_type="admin",
        roles=["admin"],
        active_role="admin",
        portal_user_id=portal_user_id,
        max_age_seconds=settings.session_max_age_seconds,
    )
    db.commit()
    csrf_token = secrets.token_urlsafe(32)
    session_expiry = datetime.now(timezone.utc) + timedelta(seconds=settings.session_max_age_seconds)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(
            session_record.session_id,
            max_age_seconds=settings.session_max_age_seconds,
        ),
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
        max_age=settings.session_max_age_seconds,
        expires=session_expiry,
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        httponly=False,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
        max_age=settings.session_max_age_seconds,
        expires=session_expiry,
    )
    return AuthIdentityResponse(
        email=principal,
        role="admin",
        permissions=get_permissions("admin"),
        actor_type="admin",
    )


@router.post("/admin/logout", response_model=LogoutResponse)
def admin_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    parsed = read_session_cookie(request.cookies.get(SESSION_COOKIE_NAME))
    revoke_session_by_id(db, parsed["session_id"] if parsed else None)
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return LogoutResponse()


@router.post("/admin/hint", response_model=LogoutResponse)
def admin_hint(
    payload: HintRequest,
    request: Request = None,  # type: ignore[assignment]
    db: Session = Depends(get_db),
) -> LogoutResponse:
    profile = db.get(AdminProfile, 1)
    principal = profile.email.strip().lower() if profile is not None else get_settings().admin_email.strip().lower()
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
    settings = get_settings()
    email = payload.email.strip().lower()
    now = _utc_now()
    state = _get_lockout_state(db, actor_type="portal", principal=email)
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    is_valid = (
        not _is_locked(state, now)
        and user is not None
        and user.is_active
        and verify_password(payload.password, user.password_hash)
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

    _reset_lock_state(state)
    user.last_login_at = now
    db.add(user)
    db.add(state)
    roles = _portal_roles_for_user(user)
    if not roles:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    role = roles[0]
    active_role = role if len(roles) == 1 else None
    session_record = create_session_record(
        db,
        principal=email,
        role=role,
        actor_type="portal",
        roles=roles,
        active_role=active_role,
        portal_user_id=user.id,
        max_age_seconds=settings.session_max_age_seconds,
    )
    db.commit()
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    assert user is not None
    roles = _portal_roles_for_user(user)
    permissions = get_permissions(active_role) if active_role else []
    csrf_token = secrets.token_urlsafe(32)
    session_expiry = datetime.now(timezone.utc) + timedelta(seconds=settings.session_max_age_seconds)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(
            session_record.session_id,
            max_age_seconds=settings.session_max_age_seconds,
        ),
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
        max_age=settings.session_max_age_seconds,
        expires=session_expiry,
    )
    response.set_cookie(
        CSRF_COOKIE_NAME,
        csrf_token,
        httponly=False,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
        max_age=settings.session_max_age_seconds,
        expires=session_expiry,
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
def portal_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    parsed = read_session_cookie(request.cookies.get(SESSION_COOKIE_NAME))
    revoke_session_by_id(db, parsed["session_id"] if parsed else None)
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return LogoutResponse()


@router.get("/unlock", response_model=LogoutResponse)
def unlock_account(
    token: str,
    actor_type: str | None = None,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    if len(token.strip()) < 16:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    if not actor_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid actor type")
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
def auth_me(request: Request, db: Session = Depends(get_db)) -> AuthIdentityResponse:
    session = require_session(request, db)
    role = session["role"]
    roles = [str(item) for item in session.get("roles", [role])]
    active_role = str(session["active_role"]) if session.get("active_role") else None
    permissions = get_permissions(active_role) if active_role else []
    return AuthIdentityResponse(
        email=session["email"],
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
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    session = require_session(request, db)
    role = str(session["role"])
    roles = [str(item) for item in session.get("roles", [role])]
    selected_role = normalize_role(payload.role)
    if selected_role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role not assigned")
    session_record = set_active_role(db, str(session["session_id"]), selected_role)
    if session_record is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    db.commit()
    setattr(
        request.state,
        "_kajovo_auth_session",
        {
            **session,
            "active_role": selected_role,
        },
    )
    return AuthIdentityResponse(
        email=str(session["email"]),
        role=role,
        roles=roles,
        active_role=selected_role,
        permissions=get_permissions(selected_role),
        actor_type=str(session["actor_type"]),
    )


@router.get("/profile", response_model=AuthProfileRead)
def auth_profile(request: Request, db: Session = Depends(get_db)) -> AuthProfileRead:
    session, user = _current_user_from_session(request, db)
    return _profile_response(session, user)


@router.patch("/profile", response_model=AuthProfileRead)
def update_auth_profile(
    payload: AuthProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthProfileRead:
    session, user = _current_user_from_session(request, db)
    user.first_name = payload.first_name.strip()
    user.last_name = payload.last_name.strip()
    user.phone = payload.phone.strip() if payload.phone else None
    user.note = payload.note.strip() if payload.note else None
    user.updated_at = _utc_now()
    db.add(user)
    db.commit()
    db.refresh(user)
    setattr(
        request.state,
        "audit_detail_override",
        json.dumps({"profile_action": "update", "user_id": user.id}),
    )
    return _profile_response(session, user)


@router.post("/change-password", response_model=LogoutResponse)
def change_own_password(
    payload: PortalPasswordChangeRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    _, user = _current_user_from_session(request, db)
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid credentials")
    user.password_hash = hash_password(payload.new_password)
    user.updated_at = _utc_now()
    revoke_sessions_for_portal_user(db, user.id)
    db.add(user)
    db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    setattr(
        request.state,
        "audit_detail_override",
        json.dumps({"password_action": "self_change", "user_id": user.id}),
    )
    return LogoutResponse()
