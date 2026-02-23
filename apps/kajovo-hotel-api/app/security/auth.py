import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, Request, status

from app.config import get_settings
from app.security.rbac import ROLE_PERMISSIONS, normalize_role

SESSION_COOKIE_NAME = "kajovo_session"
CSRF_COOKIE_NAME = "kajovo_csrf"
CSRF_HEADER_NAME = "x-csrf-token"
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _secret_key() -> bytes:
    raw = os.getenv("KAJOVO_API_SESSION_SECRET", "kajovo-dev-session-secret")
    return raw.encode("utf-8")


def _sign(raw: bytes) -> str:
    digest = hmac.new(_secret_key(), raw, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")


def create_session_cookie(email: str, role: str, actor_type: str, roles: list[str] | None = None, active_role: str | None = None) -> str:
    normalized_roles = [normalize_role(r) for r in (roles or [role])]
    payload = {
        "email": email,
        "role": normalize_role(role),
        "roles": normalized_roles,
        "active_role": normalize_role(active_role) if active_role else None,
        "actor_type": actor_type,
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    body = base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")
    return f"{body}.{_sign(raw)}"


def read_session_cookie(cookie_value: str | None) -> dict[str, str | list[str] | None] | None:
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
    email = str(data.get("email", "")).strip().lower()
    role = normalize_role(str(data.get("role", "")))
    actor_type = str(data.get("actor_type", "portal"))
    raw_roles = data.get("roles", [role])
    roles = [normalize_role(str(item)) for item in raw_roles] if isinstance(raw_roles, list) else [role]
    active_role_raw = data.get("active_role")
    active_role = normalize_role(str(active_role_raw)) if active_role_raw else None
    if not email:
        return None
    return {"email": email, "role": role, "roles": roles, "active_role": active_role, "actor_type": actor_type}


def require_session(request: Request) -> dict[str, str | list[str] | None]:
    session = read_session_cookie(request.cookies.get(SESSION_COOKIE_NAME))
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return session


def ensure_csrf(request: Request) -> None:
    if request.method not in WRITE_METHODS:
        return
    if request.url.path.startswith("/api/auth/") and request.url.path.endswith("/login"):
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
