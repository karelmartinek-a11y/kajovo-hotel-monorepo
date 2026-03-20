from fastapi import APIRouter

from app.api.schemas import AndroidAppReleaseRead
from app.android_release import get_android_release_manifest

router = APIRouter(tags=["app"])


@router.get("/api/app/android-release", response_model=AndroidAppReleaseRead)
def get_android_release() -> AndroidAppReleaseRead:
    release = get_android_release_manifest()
    return AndroidAppReleaseRead(
        version_code=release.version_code,
        version=release.version_name,
        download_url=release.download_url,
        sha256=release.sha256,
        title=release.title,
        message=release.message,
        required=release.required,
    )
