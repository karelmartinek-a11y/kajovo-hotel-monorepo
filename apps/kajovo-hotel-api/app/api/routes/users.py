import json
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.routes.auth import hash_password
from app.api.schemas import (
    PortalUserCreate,
    PortalUserPasswordSet,
    PortalUserRead,
    PortalUserStatusUpdate,
    PortalUserUpdate,
)
from app.config import get_settings
from app.db.models import PortalSmtpSettings, PortalUser, PortalUserRole
from app.db.session import get_db
from app.security.rbac import module_access_dependency, require_actor_type
from app.services.mail import (
    MailMessage,
    StoredSmtpConfig,
    build_email_service,
    send_portal_onboarding,
)

router = APIRouter(
    prefix="/api/v1/users",
    tags=["users"],
    dependencies=[Depends(require_actor_type("admin")), Depends(module_access_dependency("users"))],
)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _user_query():
    return select(PortalUser).options(selectinload(PortalUser.roles))


def _to_read_model(user: PortalUser) -> PortalUserRead:
    return PortalUserRead(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        roles=sorted([item.role for item in user.roles]),
        phone=user.phone,
        note=user.note,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def _set_roles(user: PortalUser, roles: list[str]) -> None:
    user.roles = [PortalUserRole(role=role) for role in roles]


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


@router.get("", response_model=list[PortalUserRead])
def list_users(db: Session = Depends(get_db)) -> list[PortalUserRead]:
    users = db.execute(_user_query().order_by(PortalUser.email.asc())).scalars().all()
    return [_to_read_model(user) for user in users]


@router.get("/{user_id}", response_model=PortalUserRead)
def get_user(user_id: int, db: Session = Depends(get_db)) -> PortalUserRead:
    user = db.execute(_user_query().where(PortalUser.id == user_id)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _to_read_model(user)


@router.post("", response_model=PortalUserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: PortalUserCreate, db: Session = Depends(get_db)) -> PortalUserRead:
    email = _normalize_email(str(payload.email))
    existing = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    user = PortalUser(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        phone=payload.phone,
        note=payload.note,
        is_active=True,
    )
    _set_roles(user, payload.roles)

    db.add(user)
    db.commit()
    db.refresh(user)

    settings = get_settings()
    service = build_email_service(settings, _smtp_config(db))
    send_portal_onboarding(service=service, recipient=user.email)
    return _to_read_model(user)


@router.patch("/{user_id}", response_model=PortalUserRead)
def update_user(
    user_id: int,
    payload: PortalUserUpdate,
    db: Session = Depends(get_db),
) -> PortalUserRead:
    user = db.execute(_user_query().where(PortalUser.id == user_id)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    normalized_email = _normalize_email(str(payload.email))
    email_owner = db.execute(select(PortalUser).where(PortalUser.email == normalized_email)).scalar_one_or_none()
    if email_owner is not None and email_owner.id != user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")

    user.first_name = payload.first_name.strip()
    user.last_name = payload.last_name.strip()
    user.email = normalized_email
    user.phone = payload.phone
    user.note = payload.note
    _set_roles(user, payload.roles)
    user.updated_at = datetime.utcnow()

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
    user = db.execute(_user_query().where(PortalUser.id == user_id)).scalar_one_or_none()
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
    user = db.execute(_user_query().where(PortalUser.id == user_id)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.password_hash = hash_password(payload.password)
    user.updated_at = datetime.utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)
    request.state.audit_detail_override = json.dumps({"password_action": "set", "user_id": user_id})
    return _to_read_model(user)


@router.post("/{user_id}/password/reset-link", response_model=dict[str, bool])
def send_user_password_reset_link(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    user = db.execute(_user_query().where(PortalUser.id == user_id)).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    token = secrets.token_urlsafe(32)
    reset_link = f"https://portal.kajovohotel.local/reset-password?token={token}"

    settings = get_settings()
    service = build_email_service(settings, _smtp_config(db))
    service.send(
        MailMessage(
            recipient=user.email,
            subject="KájovoHotel reset hesla",
            body=f"Pro reset hesla použijte odkaz: {reset_link}",
        )
    )
    request.state.audit_detail_override = json.dumps(
        {"password_action": "reset_link_sent", "user_id": user_id}
    )
    return {"ok": True}
