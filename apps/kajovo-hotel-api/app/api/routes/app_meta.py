from fastapi import APIRouter

from app.api.schemas import AndroidAppReleaseRead
from app.config import get_settings

router = APIRouter(tags=["app"])


@router.get("/api/app/android-release", response_model=AndroidAppReleaseRead)
def get_android_release() -> AndroidAppReleaseRead:
    settings = get_settings()
    return AndroidAppReleaseRead(
        version=settings.android_app_version,
        download_url=settings.android_app_download_url,
        title=settings.android_app_update_title,
        message=settings.android_app_update_message,
        required=settings.android_app_update_required,
    )
