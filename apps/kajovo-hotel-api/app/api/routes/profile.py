from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.schemas import (
    AdminProfileRead,
    AdminProfileUpdate,
)
from app.config import get_settings
from app.db.session import get_db
from app.security.rbac import require_actor_type
from app.services.admin_credentials import ensure_admin_profile

router = APIRouter(
    prefix="/api/v1/admin/profile",
    tags=["profile"],
    dependencies=[Depends(require_actor_type("admin"))],
)

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
