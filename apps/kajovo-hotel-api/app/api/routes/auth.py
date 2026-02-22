import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import AdminLoginRequest, AuthIdentityResponse, LogoutResponse, PortalLoginRequest
from app.config import get_settings
from app.db.models import PortalUser
from app.db.session import get_db
from app.security.auth import (
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    cookie_secure,
    create_session_cookie,
    get_permissions,
    require_session,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class HintRequest(BaseModel):
    email: str


def _verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash.startswith("scrypt$"):
        return False
    _, salt_hex, digest_hex = stored_hash.split("$", 2)
    calc = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return secrets.compare_digest(calc.hex(), digest_hex)


@router.post("/admin/login", response_model=AuthIdentityResponse)
def admin_login(payload: AdminLoginRequest, response: Response) -> AuthIdentityResponse:
    settings = get_settings()
    if payload.email.strip().lower() != settings.admin_email.strip().lower() or payload.password != settings.admin_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(SESSION_COOKIE_NAME, create_session_cookie(settings.admin_email, "admin", "admin"), httponly=True, samesite="lax", secure=cookie_secure(), path="/")
    response.set_cookie(CSRF_COOKIE_NAME, csrf_token, httponly=False, samesite="lax", secure=cookie_secure(), path="/")
    return AuthIdentityResponse(email=settings.admin_email, role="admin", permissions=get_permissions("admin"), actor_type="admin")


@router.post("/admin/logout", response_model=LogoutResponse)
def admin_logout(response: Response) -> LogoutResponse:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return LogoutResponse()


@router.post("/admin/hint", response_model=LogoutResponse)
def admin_hint(payload: HintRequest) -> LogoutResponse:
    settings = get_settings()
    if payload.email.strip().lower() != settings.admin_email.strip().lower():
        return LogoutResponse()
    # SMTP is intentionally disabled until P06; keep endpoint deterministic.
    return LogoutResponse()


@router.post("/login", response_model=AuthIdentityResponse)
def portal_login(payload: PortalLoginRequest, response: Response, db: Session = Depends(get_db)) -> AuthIdentityResponse:
    email = payload.email.strip().lower()
    user = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if user is None or not user.is_active or not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    role = user.role
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(SESSION_COOKIE_NAME, create_session_cookie(email, role, "portal"), httponly=True, samesite="lax", secure=cookie_secure(), path="/")
    response.set_cookie(CSRF_COOKIE_NAME, csrf_token, httponly=False, samesite="lax", secure=cookie_secure(), path="/")
    return AuthIdentityResponse(email=email, role=role, permissions=get_permissions(role), actor_type="portal")


@router.post("/logout", response_model=LogoutResponse)
def portal_logout(response: Response) -> LogoutResponse:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return LogoutResponse()


@router.get("/me", response_model=AuthIdentityResponse)
def auth_me(request: Request) -> AuthIdentityResponse:
    session = require_session(request)
    role = session["role"]
    return AuthIdentityResponse(
        email=session["email"],
        role=role,
        permissions=get_permissions(role),
        actor_type=session["actor_type"],
    )
