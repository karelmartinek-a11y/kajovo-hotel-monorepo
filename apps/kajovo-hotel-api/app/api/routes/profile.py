import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.schemas import (
    AdminPasswordChangeRequest,
    AdminProfileRead,
    AdminProfileUpdate,
    LogoutResponse,
)
from app.config import get_settings
from app.db.session import get_db
from app.security.passwords import hash_password, verify_password
from app.security.rbac import require_actor_type
from app.services.admin_credentials import ensure_admin_profile

router = APIRouter(
    prefix="/api/v1/admin/profile",
    tags=["profile"],
    dependencies=[Depends(require_actor_type("admin"))],
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _get_or_create_admin_profile(db: Session):
    settings = get_settings()
    return ensure_admin_profile(db, settings, sync_from_env=False)


@router.get("", response_model=AdminProfileRead)
def get_admin_profile(db: Session = Depends(get_db)) -> AdminProfileRead:
    profile = _get_or_create_admin_profile(db)
    return AdminProfileRead(
        email=profile.email,
        display_name=profile.display_name,
        password_changed_at=profile.password_changed_at,
        updated_at=profile.updated_at,
    )


@router.put("", response_model=AdminProfileRead)
def update_admin_profile(payload: AdminProfileUpdate, db: Session = Depends(get_db)) -> AdminProfileRead:
    profile = _get_or_create_admin_profile(db)
    profile.display_name = payload.display_name.strip()
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return AdminProfileRead(
        email=profile.email,
        display_name=profile.display_name,
        password_changed_at=profile.password_changed_at,
        updated_at=profile.updated_at,
    )


@router.post("/password", response_model=LogoutResponse)
def change_admin_password(
    payload: AdminPasswordChangeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> LogoutResponse:
    profile = _get_or_create_admin_profile(db)
    if not verify_password(payload.old_password, profile.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid current password")
    if payload.old_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from current password",
        )

    profile.password_hash = hash_password(payload.new_password)
    profile.password_changed_at = _utc_now()
    db.add(profile)
    db.commit()
    request.state.audit_detail_override = json.dumps(
        {"password_action": "admin_change"},
        ensure_ascii=False,
    )
    return LogoutResponse()
