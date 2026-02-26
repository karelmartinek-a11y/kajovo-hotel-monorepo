import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import (
    AdminLoginRequest,
    AuthIdentityResponse,
    ForgotPasswordRequest,
    LogoutResponse,
    PortalLoginRequest,
    PortalPasswordChangeRequest,
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
from app.services.mail import (
    StoredSmtpConfig,
    build_email_service,
    send_admin_unlock_link,
    send_user_password_reset_link,
    send_user_unlock_link,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_LOCK_WINDOW = timedelta(hours=1)
_LOCK_DURATION = timedelta(hours=1)
_UNLOCK_TOKEN_TTL = timedelta(hours=24)
_FORGOT_RATE_LIMIT = timedelta(hours=1)


class HintRequest(BaseModel):
    email: str


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


def _now() -> datetime:
    return datetime.utcnow()


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _smtp_config(db: Session) -> StoredSmtpConfig | None:
    smtp = db.get(PortalSmtpSettings, 1)
    if smtp is None:
        return None
    return StoredSmtpConfig(
        host=smtp.host,
        port=smtp.port,
        username=smtp.username,
        use_tls=smtp.use_tls,
        use_ssl=smtp.use_ssl,
        password_encrypted=smtp.password_encrypted,
    )


def _get_or_create_state(db: Session, actor_type: str, principal: str) -> AuthLockoutState:
    state = db.execute(
        select(AuthLockoutState).where(
            AuthLockoutState.actor_type == actor_type,
            AuthLockoutState.principal == principal,
        )
    ).scalar_one_or_none()
    if state is None:
        state = AuthLockoutState(actor_type=actor_type, principal=principal, failed_attempts=0)
        db.add(state)
        db.flush()
    return state


def _is_locked(state: AuthLockoutState, now: datetime) -> bool:
    return state.locked_until is not None and state.locked_until > now


def _issue_unlock_token(
    *,
    db: Session,
    actor_type: str,
    principal: str,
) -> str:
    raw = secrets.token_urlsafe(48)
    token = AuthUnlockToken(
        actor_type=actor_type,
        principal=principal,
        token_hash=_hash_token(raw),
        expires_at=_now() + _UNLOCK_TOKEN_TTL,
    )
    db.add(token)
    db.flush()
    return raw


def _mark_failure_and_lock_if_needed(
    *,
    db: Session,
    actor_type: str,
    principal: str,
) -> tuple[AuthLockoutState, bool]:
    now = _now()
    state = _get_or_create_state(db, actor_type, principal)

    if state.first_failed_at is None or now - state.first_failed_at > _LOCK_WINDOW:
        state.first_failed_at = now
        state.failed_attempts = 1
    else:
        state.failed_attempts = (state.failed_attempts or 0) + 1
    state.last_failed_at = now

    newly_locked = False
    if state.failed_attempts >= 3:
        if state.locked_until is None or state.locked_until <= now:
            state.locked_until = now + _LOCK_DURATION
            newly_locked = True
    db.add(state)
    db.flush()
    return state, newly_locked


def _clear_lock_state(db: Session, state: AuthLockoutState) -> None:
    state.failed_attempts = 0
    state.first_failed_at = None
    state.last_failed_at = None
    state.locked_until = None
    db.add(state)


def _generic_auth_error() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


@router.post("/admin/login", response_model=AuthIdentityResponse)
def admin_login(
    payload: AdminLoginRequest, response: Response, db: Session = Depends(get_db)
) -> AuthIdentityResponse:
    settings = get_settings()
    email = _normalize_email(payload.email)
    admin_email = _normalize_email(settings.admin_email)
    state = _get_or_create_state(db, "admin", admin_email)
    now = _now()

    valid_credentials = (
        email == admin_email
        and bool(settings.admin_password)
        and payload.password == settings.admin_password
    )

    if _is_locked(state, now) or not valid_credentials:
        state, newly_locked = _mark_failure_and_lock_if_needed(
            db=db, actor_type="admin", principal=admin_email
        )
        if newly_locked:
            raw_token = _issue_unlock_token(db=db, actor_type="admin", principal=admin_email)
            service = build_email_service(settings, _smtp_config(db))
            unlock_link = f"https://portal.kajovohotel.local/api/auth/unlock?actor_type=admin&token={raw_token}"
            send_admin_unlock_link(service=service, recipient=admin_email, unlock_link=unlock_link)
        db.commit()
        raise _generic_auth_error()

    _clear_lock_state(db, state)
    db.commit()

    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(
            settings.admin_email, "admin", "admin", roles=["admin"], active_role="admin"
        ),
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
def admin_hint(payload: HintRequest, db: Session = Depends(get_db)) -> LogoutResponse:
    settings = get_settings()
    admin_email = _normalize_email(settings.admin_email)
    request_email = _normalize_email(payload.email)

    if request_email != admin_email:
        return LogoutResponse()

    state = _get_or_create_state(db, "admin", admin_email)
    now = _now()
    if (
        state.last_forgot_sent_at is not None
        and now - state.last_forgot_sent_at < _FORGOT_RATE_LIMIT
    ):
        db.commit()
        return LogoutResponse()

    raw_token = _issue_unlock_token(db=db, actor_type="admin", principal=admin_email)
    state.last_forgot_sent_at = now
    db.add(state)

    service = build_email_service(settings, _smtp_config(db))
    unlock_link = (
        f"https://portal.kajovohotel.local/api/auth/unlock?actor_type=admin&token={raw_token}"
    )
    send_admin_unlock_link(service=service, recipient=admin_email, unlock_link=unlock_link)

    db.commit()
    return LogoutResponse()


@router.post("/login", response_model=AuthIdentityResponse)
def portal_login(
    payload: PortalLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    email = _normalize_email(payload.email)
    user = db.execute(
        select(PortalUser).options(selectinload(PortalUser.roles)).where(PortalUser.email == email)
    ).scalar_one_or_none()

    state = _get_or_create_state(db, "portal", email)
    now = _now()

    valid_credentials = (
        user is not None
        and user.is_active
        and bool(user.roles)
        and _verify_password(payload.password, user.password_hash)
    )

    if _is_locked(state, now) or not valid_credentials:
        state, newly_locked = _mark_failure_and_lock_if_needed(
            db=db, actor_type="portal", principal=email
        )
        if newly_locked and user is not None:
            raw_token = _issue_unlock_token(db=db, actor_type="portal", principal=email)
            settings = get_settings()
            service = build_email_service(settings, _smtp_config(db))
            unlock_link = f"https://portal.kajovohotel.local/api/auth/unlock?actor_type=portal&token={raw_token}"
            send_user_unlock_link(service=service, recipient=email, unlock_link=unlock_link)
        db.commit()
        raise _generic_auth_error()

    _clear_lock_state(db, state)
    db.commit()

    role_list = sorted([item.role for item in user.roles])
    active_role = role_list[0] if len(role_list) == 1 else None
    role = active_role or role_list[0]
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(email, role, "portal", roles=role_list, active_role=active_role),
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
        roles=role_list,
        active_role=active_role,
        permissions=get_permissions(role) if active_role else [],
        actor_type="portal",
    )


@router.post("/forgot", response_model=LogoutResponse)
def portal_forgot_password(
    payload: ForgotPasswordRequest, db: Session = Depends(get_db)
) -> LogoutResponse:
    email = _normalize_email(payload.email)
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if user is None:
        return LogoutResponse()

    state = _get_or_create_state(db, "portal", email)
    now = _now()
    if _is_locked(state, now):
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request unavailable")

    if (
        state.last_forgot_sent_at is not None
        and now - state.last_forgot_sent_at < _FORGOT_RATE_LIMIT
    ):
        db.commit()
        return LogoutResponse()

    raw_token = _issue_unlock_token(db=db, actor_type="portal", principal=email)
    state.last_forgot_sent_at = now
    db.add(state)

    settings = get_settings()
    service = build_email_service(settings, _smtp_config(db))
    reset_link = (
        f"https://portal.kajovohotel.local/api/auth/unlock?actor_type=portal&token={raw_token}"
    )
    send_user_password_reset_link(service=service, recipient=email, reset_link=reset_link)

    db.commit()
    return LogoutResponse()


@router.get("/unlock")
def unlock_account(
    token: str = Query(..., min_length=16),
    actor_type: str = Query(...),
    db: Session = Depends(get_db),
):
    now = _now()
    token_hash = _hash_token(token)
    record = db.execute(
        select(AuthUnlockToken).where(
            AuthUnlockToken.token_hash == token_hash,
            AuthUnlockToken.actor_type == actor_type,
        )
    ).scalar_one_or_none()

    if record is None or record.used_at is not None or record.expires_at <= now:
        return RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)

    state = db.execute(
        select(AuthLockoutState).where(
            AuthLockoutState.actor_type == actor_type,
            AuthLockoutState.principal == record.principal,
        )
    ).scalar_one_or_none()
    if state is not None:
        _clear_lock_state(db, state)

    record.used_at = now
    db.add(record)
    db.commit()

    redirect_url = "/admin/login" if actor_type == "admin" else "/login"
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)


@router.post("/password", response_model=LogoutResponse)
def portal_change_password(
    payload: PortalPasswordChangeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    session = require_session(request)
    if session.get("actor_type") != "portal":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Missing actor type: portal"
        )

    email = _normalize_email(session["email"])
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if user is None or not _verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid credentials")

    user.password_hash = hash_password(payload.new_password)
    user.updated_at = datetime.utcnow()
    db.add(user)
    db.commit()
    return LogoutResponse()


@router.post("/select-role", response_model=AuthIdentityResponse)
def select_portal_role(
    payload: SelectRoleRequest,
    request: Request,
    response: Response,
) -> AuthIdentityResponse:
    session = require_session(request)
    if session.get("actor_type") != "portal":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Missing actor type: portal"
        )

    selected = payload.role.strip().lower()
    roles = [
        str(item)
        for item in (session.get("roles") if isinstance(session.get("roles"), list) else [])
    ]
    if selected not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role not assigned")

    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(
            str(session["email"]),
            selected,
            "portal",
            roles=roles,
            active_role=selected,
        ),
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
        email=str(session["email"]),
        role=selected,
        roles=roles,
        active_role=selected,
        permissions=get_permissions(selected),
        actor_type="portal",
    )


@router.post("/logout", response_model=LogoutResponse)
def portal_logout(response: Response) -> LogoutResponse:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return LogoutResponse()


@router.get("/me", response_model=AuthIdentityResponse)
def auth_me(request: Request) -> AuthIdentityResponse:
    session = require_session(request)
    role = str(session.get("active_role") or session.get("role"))
    roles = session.get("roles") if isinstance(session.get("roles"), list) else [role]
    return AuthIdentityResponse(
        email=str(session["email"]),
        role=role,
        roles=[str(item) for item in roles],
        active_role=str(session.get("active_role")) if session.get("active_role") else None,
        permissions=get_permissions(role) if session.get("active_role") else [],
        actor_type=str(session["actor_type"]),
    )
