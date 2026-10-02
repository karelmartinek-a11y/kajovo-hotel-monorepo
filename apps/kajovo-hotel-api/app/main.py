import asyncio
import contextlib
import os

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.android_release import get_android_release_manifest
from app.api.routes.app_meta import router as app_meta_router
from app.api.routes.auth import router as auth_router
from app.api.routes.breakfast import router as breakfast_router
from app.api.routes.chat import dispatch_pending_chat_fcm, dispatch_pending_chat_pushes
from app.api.routes.chat import router as chat_router
from app.api.routes.device import router as device_router
from app.api.routes.health import router as health_router
from app.api.routes.housekeeping import router as housekeeping_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.issues import router as issues_router
from app.api.routes.lost_found import router as lost_found_router
from app.api.routes.profile import router as profile_router
from app.api.routes.reports import router as reports_router
from app.api.routes.settings import router as settings_router
from app.api.routes.users import router as users_router
from app.api.routes.voice_core import router as voice_core_router
from app.api.routes.voice_memory import router as voice_memory_router
from app.config import get_settings
from app.db.session import SessionLocal, initialize_database
from app.observability import RequestContextMiddleware, configure_logging
from app.security.auth import ensure_csrf
from app.services.admin_credentials import ensure_admin_profile
from app.services.breakfast.scheduler import breakfast_scheduler_loop
from app.services.voice_smart import manager as voice_bridge_manager

settings = get_settings()
ANDROID_RELEASE_PATH = "/api/app/android-release"


def android_client_requires_update(
    *,
    user_agent: str,
    version_code_header: str | None,
    path: str,
    release_required: bool,
    required_version_code: int,
) -> bool:
    if not release_required or path == ANDROID_RELEASE_PATH or not user_agent.lower().startswith("okhttp/"):
        return False
    client_version_code = int(version_code_header) if version_code_header and version_code_header.isdigit() else None
    return client_version_code is None or client_version_code < required_version_code


def has_explicit_admin_env() -> bool:
    return bool(
        (os.getenv("KAJOVO_API_ADMIN_EMAIL") or os.getenv("HOTEL_ADMIN_EMAIL"))
        and (os.getenv("KAJOVO_API_ADMIN_PASSWORD") or os.getenv("HOTEL_ADMIN_PASSWORD"))
    )


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(RequestValidationError)
    async def safe_validation_error(request: Request, exc: RequestValidationError):
        if request.url.path.startswith(("/api/v1/admin/voice-core/", "/api/v1/admin/voice-memory/")):
            return JSONResponse(status_code=422, content={"detail": {"code": "invalid_configuration"}},
                                headers={"Cache-Control": "no-store"})
        return await request_validation_exception_handler(request, exc)


    if settings.trusted_hosts:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=settings.trusted_hosts,
        )

    if settings.cors_allow_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_allow_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def security_middleware(request: Request, call_next):
        try:
            ensure_csrf(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

        android_release = get_android_release_manifest()
        if android_client_requires_update(
            user_agent=request.headers.get("user-agent", ""),
            version_code_header=request.headers.get("X-Kajovo-Android-Version-Code"),
            path=request.url.path,
            release_required=android_release.required,
            required_version_code=android_release.version_code,
        ):
            response = JSONResponse(
                status_code=426,
                content={"detail": "Aktualizace nativní aplikace je povinná."},
            )
        else:
            response = await call_next(request)
        if request.url.path.startswith(("/api/v1/admin/voice-core/", "/api/v1/admin/voice-memory/")):
            response.headers["Cache-Control"] = "no-store"
        response.headers.setdefault("Content-Security-Policy", settings.content_security_policy)
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Permissions-Policy", "geolocation=()")
        response.headers.setdefault("X-Kajovo-Android-Version", android_release.version_name)
        response.headers.setdefault("X-Kajovo-Android-Version-Code", str(android_release.version_code))
        response.headers.setdefault("X-Kajovo-Android-Update-Required", "true" if android_release.required else "false")
        if settings.environment.lower() == "production":
            response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
        return response

    app.include_router(auth_router)
    app.include_router(app_meta_router)
    app.include_router(health_router)
    app.include_router(reports_router)
    app.include_router(breakfast_router)
    app.include_router(chat_router)
    app.include_router(housekeeping_router)
    app.include_router(device_router)
    app.include_router(lost_found_router)
    app.include_router(issues_router)
    app.include_router(inventory_router)
    app.include_router(users_router)
    app.include_router(settings_router)
    app.include_router(profile_router)
    app.include_router(voice_core_router)
    app.include_router(voice_memory_router)

    @app.on_event("startup")
    async def startup_scheduler() -> None:
        initialize_database()
        with SessionLocal() as db:
            ensure_admin_profile(db, settings, sync_from_env=has_explicit_admin_env())
        if settings.breakfast_scheduler_enabled:
            app.state.breakfast_scheduler_task = asyncio.create_task(breakfast_scheduler_loop())
        app.state.chat_push_scheduler_task = asyncio.create_task(chat_push_scheduler_loop())
        app.state.voice_bridge_housekeeping_task = asyncio.create_task(voice_bridge_manager.housekeeping())

    @app.on_event("shutdown")
    async def shutdown_scheduler() -> None:
        voice_task = getattr(app.state, "voice_bridge_housekeeping_task", None)
        if voice_task:
            voice_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await voice_task
        await voice_bridge_manager.shutdown()
        task = getattr(app.state, "breakfast_scheduler_task", None)
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        chat_task = getattr(app.state, "chat_push_scheduler_task", None)
        if chat_task is not None:
            chat_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await chat_task

    return app


async def chat_push_scheduler_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(dispatch_pending_chat_pushes)
            await asyncio.to_thread(dispatch_pending_chat_fcm)
        except asyncio.CancelledError:
            raise
        except Exception:
            import logging

            logging.getLogger(__name__).exception("Chat push dispatcher failed")
        await asyncio.sleep(5)


app = create_app()
