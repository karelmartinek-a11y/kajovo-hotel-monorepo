import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.routes.auth import hash_password
from app.api.schemas import (
    PortalUserCreate,
    PortalUserPasswordSet,
    PortalUserRead,
    PortalUserStatusUpdate,
)
from app.db.models import PortalUser
from app.db.session import get_db
from app.security.rbac import module_access_dependency

router = APIRouter(
    prefix="/api/v1/users",
    tags=["users"],
    dependencies=[Depends(module_access_dependency("users"))],
)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


@router.get("", response_model=list[PortalUserRead])
def list_users(db: Session = Depends(get_db)) -> list[PortalUserRead]:
    users = db.execute(select(PortalUser).order_by(PortalUser.email.asc())).scalars().all()
    return [PortalUserRead.model_validate(user) for user in users]


@router.get("/{user_id}", response_model=PortalUserRead)
def get_user(user_id: int, db: Session = Depends(get_db)) -> PortalUserRead:
    user = db.get(PortalUser, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return PortalUserRead.model_validate(user)


@router.post("", response_model=PortalUserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: PortalUserCreate, db: Session = Depends(get_db)) -> PortalUserRead:
    email = _normalize_email(payload.email)
    existing = db.execute(select(PortalUser).where(PortalUser.email == email)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    user = PortalUser(
        email=email,
        role="manager",
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return PortalUserRead.model_validate(user)


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
    return PortalUserRead.model_validate(user)


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
    return PortalUserRead.model_validate(user)


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
    return PortalUserRead.model_validate(user)
