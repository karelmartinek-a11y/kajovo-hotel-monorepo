import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.schemas import (
    AdminLoginRequest,
    AuthIdentityResponse,
    ForgotPasswordRequest,
    LogoutResponse,
    PortalPasswordChangeRequest,
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
from app.services.mail import build_email_service, send_admin_unlock_link, send_user_unlock_link

router = APIRouter(prefix="/api/auth", tags=["auth"])

LOCKOUT_THRESHOLD = 3
LOCKOUT_WINDOW = timedelta(hours=1)
LOCKOUT_DURATION = timedelta(hours=1)
FORGOT_THROTTLE = timedelta(hours=1)
UNLOCK_TOKEN_TTL = timedelta(hours=24)


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


def _smtp_settings(db: Session) -> PortalSmtpSettings | None:
    return db.get(PortalSmtpSettings, 1)


def _lockout_state(db: Session, actor_type: str, principal: str) -> AuthLockoutState | None:
    return db.execute(
        select(AuthLockoutState).where(
            AuthLockoutState.actor_type == actor_type,
            AuthLockoutState.principal == principal,
        )
    ).scalar_one_or_none()


def _is_locked(state: AuthLockoutState | None) -> bool:
    return bool(state and state.locked_until and state.locked_until > datetime.utcnow())


def _record_failed_login(db: Session, actor_type: str, principal: str) -> None:
    now = datetime.utcnow()
    state = _lockout_state(db, actor_type, principal)
    if state is None:
        state = AuthLockoutState(actor_type=actor_type, principal=principal, failed_attempts=0)
    if state.first_failed_at is not None and (now - state.first_failed_at) > LOCKOUT_WINDOW:
        state.failed_attempts = 0
        state.first_failed_at = None
        state.last_failed_at = None
    state.failed_attempts += 1
    if state.first_failed_at is None:
        state.first_failed_at = now
    state.last_failed_at = now
    if state.failed_attempts >= LOCKOUT_THRESHOLD:
        state.locked_until = now + LOCKOUT_DURATION
    db.add(state)
    db.commit()


def _clear_lockout(db: Session, actor_type: str, principal: str) -> None:
    state = _lockout_state(db, actor_type, principal)
    if state is None:
        return
    state.failed_attempts = 0
    state.first_failed_at = None
    state.last_failed_at = None
    state.locked_until = None
    db.add(state)
    db.commit()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _build_unlock_link(request: Request, token: str) -> str:
    return f"{request.base_url}api/auth/unlock?token={token}"


def _create_unlock_token(db: Session, actor_type: str, principal: str) -> str:
    db.query(AuthUnlockToken).filter(
        AuthUnlockToken.actor_type == actor_type,
        AuthUnlockToken.principal == principal,
        AuthUnlockToken.used_at.is_(None),
    ).delete(synchronize_session=False)
    token = secrets.token_urlsafe(32)
    db.add(
        AuthUnlockToken(
            actor_type=actor_type,
            principal=principal,
            token_hash=_token_hash(token),
            expires_at=datetime.utcnow() + UNLOCK_TOKEN_TTL,
        )
    )
    db.commit()
    return token


@router.post("/admin/login", response_model=AuthIdentityResponse)
def admin_login(
    payload: AdminLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    settings = get_settings()
    principal = payload.email.strip().lower()
    state = _lockout_state(db, "admin", principal)
    if _is_locked(state):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if principal != settings.admin_email.strip().lower() or payload.password != settings.admin_password:
        _record_failed_login(db, "admin", principal)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    _clear_lockout(db, "admin", principal)
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
def admin_hint(payload: HintRequest, request: Request, db: Session = Depends(get_db)) -> LogoutResponse:
    settings = get_settings()
    recipient = payload.email.strip().lower()
    if recipient != settings.admin_email.strip().lower():
        return LogoutResponse()

    state = _lockout_state(db, "admin", recipient)
    now = datetime.utcnow()
    if state is None:
        state = AuthLockoutState(actor_type="admin", principal=recipient, failed_attempts=0)
    should_send = state.last_forgot_sent_at is None or (now - state.last_forgot_sent_at) >= FORGOT_THROTTLE
    if should_send:
        service = build_email_service(settings, _smtp_settings(db))
        token = _create_unlock_token(db, "admin", recipient)
        send_admin_unlock_link(
            service=service,
            recipient=recipient,
            unlock_link=_build_unlock_link(request, token),
        )
        state.last_forgot_sent_at = now
        db.add(state)
        db.commit()
    return LogoutResponse()


@router.post("/login", response_model=AuthIdentityResponse)
def portal_login(
    payload: PortalLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    email = payload.email.strip().lower()
    state = _lockout_state(db, "portal", email)
    if _is_locked(state):
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
        permissions=get_permissions(active_role) if active_role else [],
        actor_type="portal",
    )


@router.post("/select-role", response_model=AuthIdentityResponse)
def select_portal_role(
    payload: SelectRoleRequest,
    request: Request,
    response: Response,
) -> AuthIdentityResponse:
    session = require_session(request)
    if session.get("actor_type") != "portal":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing actor type: portal")

    session_roles = [normalize_role(str(item)) for item in session.get("roles", [])]
    selected_role = normalize_role(payload.role)
    if selected_role not in session_roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role is not assigned")

    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(
            str(session["email"]),
            selected_role,
            "portal",
            roles=session_roles,
            active_role=selected_role,
        ),
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )
    return AuthIdentityResponse(
        email=str(session["email"]),
        role=selected_role,
        roles=session_roles,
        active_role=selected_role,
        permissions=get_permissions(selected_role),
        actor_type="portal",
    )


@router.post("/logout", response_model=LogoutResponse)
def portal_logout(response: Response) -> LogoutResponse:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return LogoutResponse()


@router.post("/forgot", response_model=LogoutResponse)
def portal_forgot(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)) -> LogoutResponse:
    email = payload.email.strip().lower()
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if user is None or not user.is_active:
        return LogoutResponse()

    state = _lockout_state(db, "portal", email)
    now = datetime.utcnow()
    if state is None:
        state = AuthLockoutState(actor_type="portal", principal=email, failed_attempts=0)
    if _is_locked(state):
        return LogoutResponse()
    should_send = state.last_forgot_sent_at is None or (now - state.last_forgot_sent_at) >= FORGOT_THROTTLE
    if should_send:
        service = build_email_service(get_settings(), _smtp_settings(db))
        token = _create_unlock_token(db, "portal", email)
        send_user_unlock_link(
            service=service,
            recipient=email,
            unlock_link=_build_unlock_link(request, token),
        )
        state.last_forgot_sent_at = now
        db.add(state)
        db.commit()
    return LogoutResponse()


@router.get("/unlock", response_model=LogoutResponse)
def unlock_account(token: str, db: Session = Depends(get_db)) -> LogoutResponse:
    token_hash = _token_hash(token)
    unlock = db.execute(select(AuthUnlockToken).where(AuthUnlockToken.token_hash == token_hash)).scalar_one_or_none()
    if unlock is None or unlock.used_at is not None or unlock.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    unlock.used_at = datetime.utcnow()
    db.add(unlock)
    _clear_lockout(db, unlock.actor_type, unlock.principal)
    db.commit()
    return LogoutResponse()


@router.post("/password", response_model=LogoutResponse)
def portal_change_password(
    payload: PortalPasswordChangeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    session = require_session(request)
    if session.get("actor_type") != "portal":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing actor type: portal")
    email = str(session["email"]).strip().lower()
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if user is None or not _verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user.password_hash = hash_password(payload.new_password)
    db.add(user)
    db.commit()
    return LogoutResponse()


@router.get("/me", response_model=AuthIdentityResponse)
def auth_me(request: Request) -> AuthIdentityResponse:
    session = require_session(request)
    active_role = session.get("active_role")
    role = str(active_role or session["role"])
    permissions = get_permissions(role)
    if session.get("actor_type") == "portal" and not active_role:
        permissions = []
    return AuthIdentityResponse(
        email=str(session["email"]),
        role=role,
        roles=[normalize_role(str(item)) for item in session.get("roles", [])],
        active_role=str(active_role) if active_role else None,
        permissions=permissions,
        actor_type=str(session["actor_type"]),
    )
