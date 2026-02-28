import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

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
from app.db.models import AuthLockoutState, PortalSmtpSettings, PortalUser
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
    send_admin_password_hint,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


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


def _stored_from_record(record: PortalSmtpSettings) -> StoredSmtpConfig:
    return StoredSmtpConfig(
        host=record.host,
        port=record.port,
        username=record.username,
        use_tls=record.use_tls,
        use_ssl=record.use_ssl,
        password_encrypted=record.password_encrypted,
    )


def _is_locked(db: Session, actor_type: str, principal: str) -> bool:
    state = db.execute(
        select(AuthLockoutState).where(
            AuthLockoutState.actor_type == actor_type,
            AuthLockoutState.principal == principal,
        )
    ).scalar_one_or_none()
    if state is None or state.locked_until is None:
        return False
    locked_until = state.locked_until
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    return locked_until > datetime.now(timezone.utc)


def _user_roles(user: PortalUser) -> list[str]:
    roles = [normalize_role(role.role) for role in user.roles]
    return roles or ["recepce"]


@router.post("/admin/login", response_model=AuthIdentityResponse)
def admin_login(
    payload: AdminLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    settings = get_settings()
    email = payload.email.strip().lower()
    if _is_locked(db, "admin", email):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if (
        email != settings.admin_email.strip().lower()
        or payload.password != settings.admin_password
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(settings.admin_email, "admin", "admin"),
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
    if payload.email.strip().lower() != settings.admin_email.strip().lower():
        return LogoutResponse()
    record = db.get(PortalSmtpSettings, 1)
    service = build_email_service(
        settings,
        _stored_from_record(record) if record is not None else None,
    )
    send_admin_password_hint(
        service=service,
        recipient=settings.admin_email,
        hint=settings.admin_password,
    )
    return LogoutResponse()


@router.post("/login", response_model=AuthIdentityResponse)
def portal_login(
    payload: PortalLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    email = payload.email.strip().lower()
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if (
        user is None
        or not user.is_active
        or not _verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    roles = _user_roles(user)
    active_role = roles[0] if len(roles) == 1 else None
    role = active_role or roles[0]
    permissions = get_permissions(active_role) if active_role else []
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(
            email,
            role,
            "portal",
            roles=roles,
            active_role=active_role,
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
        email=email,
        role=role,
        roles=roles,
        active_role=active_role,
        permissions=permissions,
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
    role = str(session["role"])
    roles = list(session.get("roles", [role]))
    active_role = session.get("active_role")
    permissions = get_permissions(str(active_role)) if active_role else []
    return AuthIdentityResponse(
        email=session["email"],
        role=role,
        roles=roles,
        active_role=active_role,
        permissions=permissions,
        actor_type=session["actor_type"],
    )


@router.post("/forgot", response_model=LogoutResponse)
def portal_forgot_password(payload: ForgotPasswordRequest) -> LogoutResponse:
    _ = payload
    return LogoutResponse()


@router.post("/password", response_model=LogoutResponse)
def portal_change_password(
    payload: PortalPasswordChangeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    session = require_session(request)
    email = str(session["email"]).strip().lower()
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if user is None or not _verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user.password_hash = hash_password(payload.new_password)
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
    roles = [normalize_role(str(role)) for role in session.get("roles", [])]
    selected_role = normalize_role(payload.role)
    if selected_role not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing role assignment")
    role = str(session["role"])
    email = str(session["email"])
    actor_type = str(session["actor_type"])
    response.set_cookie(
        SESSION_COOKIE_NAME,
        create_session_cookie(
            email,
            role,
            actor_type,
            roles=roles,
            active_role=selected_role,
        ),
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )
    return AuthIdentityResponse(
        email=email,
        role=role,
        roles=roles,
        active_role=selected_role,
        permissions=get_permissions(selected_role),
        actor_type=actor_type,
    )


@router.get("/unlock")
def unlock_account() -> dict[str, bool]:
    return {"ok": True}
