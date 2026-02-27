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
    LogoutResponse,
    PortalLoginRequest,
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


@router.post("/admin/login", response_model=AuthIdentityResponse)
def admin_login(
    payload: AdminLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthIdentityResponse:
    settings = get_settings()
    principal = payload.email.strip().lower()
    lockout_state = db.execute(
        select(AuthLockoutState).where(
            AuthLockoutState.actor_type == "admin",
            AuthLockoutState.principal == principal,
        )
    ).scalar_one_or_none()
    if lockout_state and lockout_state.locked_until:
        locked_until = lockout_state.locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > datetime.now(timezone.utc):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if principal != settings.admin_email.strip().lower() or payload.password != settings.admin_password:
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
    smtp_config = (
        StoredSmtpConfig(
            host=record.host,
            port=record.port,
            username=record.username,
            use_tls=record.use_tls,
            use_ssl=record.use_ssl,
            password_encrypted=record.password_encrypted,
        )
        if record
        else None
    )
    service = build_email_service(settings, smtp_config)
    send_admin_password_hint(
        service=service,
        recipient=payload.email.strip().lower(),
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

    roles = [normalize_role(role.role) for role in user.roles]
    role = roles[0] if roles else "recepce"
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


@router.post("/logout", response_model=LogoutResponse)
def portal_logout(response: Response) -> LogoutResponse:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return LogoutResponse()


@router.get("/me", response_model=AuthIdentityResponse)
def auth_me(request: Request) -> AuthIdentityResponse:
    session = require_session(request)
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
def select_role(
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
