import hashlib
import json
import secrets
from datetime import datetime
from datetime import timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.auth import hash_password
from app.api.schemas import (
    PortalUserCreate,
    PortalUserPasswordSet,
    PortalUserRead,
    PortalUserStatusUpdate,
    PortalUserUpdate,
    LogoutResponse,
)
from app.config import get_settings
from app.db.models import AuthUnlockToken, PortalSmtpSettings, PortalUser, PortalUserRole
from app.db.session import get_db
from app.security.rbac import module_access_dependency
from app.services.mail import (
    StoredSmtpConfig,
    build_email_service,
    send_portal_onboarding,
    send_user_password_reset_link,
)

router = APIRouter(
    prefix="/api/v1/users",
    tags=["users"],
    dependencies=[Depends(module_access_dependency("users"))],
)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _stored_smtp_config(record: PortalSmtpSettings | None) -> StoredSmtpConfig | None:
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


def _to_read_model(user: PortalUser) -> PortalUserRead:
    roles = [role.role for role in user.roles]
    primary_role = roles[0] if roles else "recepce"
    return PortalUserRead(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        role=primary_role,
        roles=roles,
        phone=user.phone,
        note=user.note,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def _issue_portal_reset_token(db: Session, principal: str) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = datetime.now(timezone.utc)
    db.add(
        AuthUnlockToken(
            actor_type="portal",
            principal=principal,
            token_hash=token_hash,
            expires_at=now + timedelta(hours=24),
        )
    )
    return token


@router.get("", response_model=list[PortalUserRead])
def list_users(db: Session = Depends(get_db)) -> list[PortalUserRead]:
    users = db.execute(select(PortalUser).order_by(PortalUser.email.asc())).scalars().all()
    return [_to_read_model(user) for user in users]


@router.get("/{user_id}", response_model=PortalUserRead)
def get_user(user_id: int, db: Session = Depends(get_db)) -> PortalUserRead:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _to_read_model(user)


@router.post("", response_model=PortalUserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: PortalUserCreate, db: Session = Depends(get_db)) -> PortalUserRead:
    email = _normalize_email(payload.email)
    existing = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    user = PortalUser(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=email,
        phone=payload.phone,
        note=payload.note,
        password_hash=hash_password(payload.password),
        is_active=True,
        roles=[PortalUserRole(role=role) for role in payload.roles],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    settings = get_settings()
    service = build_email_service(settings, _stored_smtp_config(db.get(PortalSmtpSettings, 1)))
    send_portal_onboarding(service=service, recipient=user.email)
    return _to_read_model(user)


@router.patch("/{user_id}", response_model=PortalUserRead)
def update_user(
    user_id: int,
    payload: PortalUserUpdate,
    db: Session = Depends(get_db),
) -> PortalUserRead:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    email = _normalize_email(payload.email)
    conflict = db.execute(
        select(PortalUser).where(PortalUser.email == email, PortalUser.id != user_id)
    ).scalar_one_or_none()
    if conflict is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    user.first_name = payload.first_name
    user.last_name = payload.last_name
    user.email = email
    user.phone = payload.phone
    user.note = payload.note
    user.roles = [PortalUserRole(role=role) for role in payload.roles]
    user.updated_at = datetime.now()
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_read_model(user)


@router.patch("/{user_id}/active", response_model=PortalUserRead)
def set_user_active(
    user_id: int,
    payload: PortalUserStatusUpdate,
    db: Session = Depends(get_db),
) -> PortalUserRead:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = payload.is_active
    user.updated_at = datetime.utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_read_model(user)


@router.post("/{user_id}/password", response_model=PortalUserRead)
def set_user_password(
    user_id: int,
    payload: PortalUserPasswordSet,
    request: Request,
    db: Session = Depends(get_db),
) -> PortalUserRead:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.password_hash = hash_password(payload.password)
    user.updated_at = datetime.utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)
    request.state.audit_detail_override = json.dumps(
        {"password_action": "set", "user_id": user_id}
    )
    return _to_read_model(user)


@router.post("/{user_id}/password/reset", response_model=PortalUserRead)
def reset_user_password(
    user_id: int,
    payload: PortalUserPasswordSet,
    request: Request,
    db: Session = Depends(get_db),
) -> PortalUserRead:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.password_hash = hash_password(payload.password)
    user.updated_at = datetime.utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)
    request.state.audit_detail_override = json.dumps(
        {"password_action": "reset", "user_id": user_id}
    )
    return _to_read_model(user)


@router.post("/{user_id}/password/reset-link", response_model=LogoutResponse)
def send_user_reset_link(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    settings = get_settings()
    token = _issue_portal_reset_token(db, user.email)
    reset_link = (
        f"{str(request.base_url).rstrip('/')}/api/auth/unlock?"
        f"{urlencode({'token': token, 'actor_type': 'portal'})}"
    )
    service = build_email_service(settings, _stored_smtp_config(db.get(PortalSmtpSettings, 1)))
    send_user_password_reset_link(service=service, recipient=user.email, reset_link=reset_link)
    db.commit()
    return LogoutResponse()
