import hashlib
import json
import secrets
from datetime import timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.schemas import (
    PortalUserCreate,
    PortalUserPasswordSet,
    PortalUserRead,
    PortalUserStatusUpdate,
    PortalUserUpdate,
    UserPasswordResetLinkResponse,
)
from app.config import get_settings
from app.db.models import AuthUnlockToken, PortalSmtpSettings, PortalUser, PortalUserRole
from app.db.session import get_db
from app.security.auth import revoke_sessions_for_portal_user
from app.security.passwords import hash_password
from app.security.rbac import (
    module_access_dependency,
    normalize_role,
    parse_identity,
    require_actor_type,
)
from app.services.mail import (
    SmtpDeliveryError,
    SmtpNotConfiguredError,
    StoredSmtpConfig,
    build_email_service,
    send_portal_onboarding,
    send_user_password_reset_link,
)
from app.time_utils import utc_now

router = APIRouter(
    prefix="/api/v1/users",
    tags=["users"],
    dependencies=[Depends(require_actor_type("admin")), Depends(module_access_dependency("users"))],
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
    primary_role = roles[0] if roles else None
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
        last_login_at=user.last_login_at,
    )


def _is_admin_user(user: PortalUser) -> bool:
    return any(normalize_role(role.role) == "admin" for role in user.roles)


def _count_active_admins(db: Session) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(PortalUserRole)
            .join(PortalUser)
            .where(
                PortalUserRole.role == "admin",
                PortalUser.is_active.is_(True),
            )
        )
        or 0
    )


def _issue_portal_reset_token(db: Session, principal: str) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = utc_now()
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
    password = payload.password or secrets.token_urlsafe(24)
    user = PortalUser(
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=email,
        phone=payload.phone,
        note=payload.note,
        password_hash=hash_password(password),
        is_active=True,
        roles=[PortalUserRole(role=role) for role in payload.roles],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    response_model = _to_read_model(user)
    settings = get_settings()
    try:
        service = build_email_service(settings, _stored_smtp_config(db.get(PortalSmtpSettings, 1)))
        send_portal_onboarding(service=service, recipient=user.email)
    except Exception:
        # CRUD uzivatele nesmi spadnout na volitelnem onboarding e-mailu.
        db.rollback()
    return response_model


@router.patch("/{user_id}", response_model=PortalUserRead)
def update_user(
    user_id: int,
    payload: PortalUserUpdate,
    db: Session = Depends(get_db),
) -> PortalUserRead:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    previous_roles = sorted(normalize_role(role.role) for role in user.roles)
    was_admin = "admin" in previous_roles
    new_roles = [normalize_role(role) for role in payload.roles]
    email = _normalize_email(payload.email)
    conflict = db.execute(
        select(PortalUser).where(PortalUser.email == email, PortalUser.id != user_id)
    ).scalar_one_or_none()
    if conflict is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    if was_admin and "admin" not in new_roles and user.is_active and _count_active_admins(db) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot remove admin role from the last admin user",
        )
    user.first_name = payload.first_name
    user.last_name = payload.last_name
    user.email = email
    user.phone = payload.phone
    user.note = payload.note
    user.roles = [PortalUserRole(role=role) for role in new_roles]
    user.updated_at = utc_now()
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
    if _is_admin_user(user) and user.is_active and not payload.is_active and _count_active_admins(db) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot deactivate the last admin user",
        )
    user.is_active = payload.is_active
    user.updated_at = utc_now()
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
    user.updated_at = utc_now()
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
    user.updated_at = utc_now()
    db.add(user)
    db.commit()
    db.refresh(user)
    request.state.audit_detail_override = json.dumps(
        {"password_action": "reset", "user_id": user_id}
    )
    return _to_read_model(user)


@router.post("/{user_id}/password/reset-link", response_model=UserPasswordResetLinkResponse)
def send_user_reset_link(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> UserPasswordResetLinkResponse:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    settings = get_settings()
    token = _issue_portal_reset_token(db, user.email)
    reset_link = (
        f"{str(request.base_url).rstrip('/')}/api/auth/unlock?"
        f"{urlencode({'token': token, 'actor_type': 'portal'})}"
    )
    try:
        service = build_email_service(settings, _stored_smtp_config(db.get(PortalSmtpSettings, 1)))
        result = send_user_password_reset_link(service=service, recipient=user.email, reset_link=reset_link)
        db.commit()
        return UserPasswordResetLinkResponse(
            ok=True,
            connected=result.connected,
            send_attempted=result.send_attempted,
            message=f"Resetovací odkaz byl reálně odeslán na {user.email}.",
        )
    except SmtpNotConfiguredError:
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP není aktivní. Resetovací token byl vytvořen, ale e-mail nebyl odeslán.",
        )
    except SmtpDeliveryError as exc:
        db.commit()
        if exc.connected and exc.send_attempted:
            detail = "SMTP je aktivní, proběhl reálný pokus o odeslání, ale resetovací odkaz se nepodařilo doručit."
        elif exc.connected:
            detail = "SMTP spojení proběhlo, ale k odeslání resetovacího odkazu nedošlo."
        else:
            detail = "SMTP se nepodařilo připojit, resetovací odkaz nebyl odeslán."
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        ) from exc
    except Exception:
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SMTP je aktivní, ale odeslání resetovacího odkazu selhalo.",
        )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_actor_type("admin")),
) -> None:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    actor_email, _, _ = parse_identity(request)
    target_email = user.email.strip().lower()

    if actor_email and actor_email.strip().lower() == target_email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete your own account",
        )

    if _is_admin_user(user) and user.is_active and _count_active_admins(db) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete the last admin user",
        )

    audit_payload = json.dumps({"user_id": user.id, "email": user.email})
    revoke_sessions_for_portal_user(db, user.id)
    db.delete(user)
    db.commit()
    request.state.audit_detail_override = audit_payload
