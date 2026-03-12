from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import AdminProfile
from app.security.passwords import hash_password, verify_password
from app.time_utils import utc_now


def normalize_admin_email(email: str) -> str:
    return email.strip().lower()


def ensure_admin_profile(db: Session, settings: Settings, *, sync_from_env: bool) -> AdminProfile:
    resolved_email = normalize_admin_email(settings.admin_email)
    profile = db.get(AdminProfile, 1)
    if profile is None:
        profile = AdminProfile(
            id=1,
            email=resolved_email,
            password_hash=hash_password(settings.admin_password),
            display_name="Admin",
            password_changed_at=None,
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile

    changed = False
    if profile.email != resolved_email:
        profile.email = resolved_email
        changed = True

    if sync_from_env and not verify_password(settings.admin_password, profile.password_hash):
        profile.password_hash = hash_password(settings.admin_password)
        profile.password_changed_at = utc_now()
        changed = True

    if changed:
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return profile
