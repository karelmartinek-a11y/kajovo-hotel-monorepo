import asyncio
import contextlib

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.routes.app_meta import router as app_meta_router
from app.api.routes.auth import router as auth_router
from app.api.routes.breakfast import router as breakfast_router
from app.api.routes.device import router as device_router
from app.api.routes.health import router as health_router
from app.api.routes.inventory import router as inventory_router
from app.api.routes.issues import router as issues_router
from app.api.routes.lost_found import router as lost_found_router
from app.api.routes.profile import router as profile_router
from app.api.routes.reports import router as reports_router
from app.api.routes.settings import router as settings_router
from app.api.routes.users import router as users_router
from app.config import get_settings
from app.db.session import SessionLocal, initialize_database
from app.observability import RequestContextMiddleware, configure_logging
from app.security.auth import ensure_csrf
from app.services.admin_credentials import ensure_admin_profile
from app.services.breakfast.scheduler import breakfast_scheduler_loop

settings = get_settings()


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.add_middleware(RequestContextMiddleware)

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

        response = await call_next(request)
        response.headers.setdefault("Content-Security-Policy", settings.content_security_policy)
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Permissions-Policy", "geolocation=()")
        if settings.environment.lower() == "production":
            response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
        return response

    app.include_router(auth_router)
    app.include_router(app_meta_router)
    app.include_router(health_router)
    app.include_router(reports_router)
    app.include_router(breakfast_router)
    app.include_router(device_router)
    app.include_router(lost_found_router)
    app.include_router(issues_router)
    app.include_router(inventory_router)
    app.include_router(users_router)
    app.include_router(settings_router)
    app.include_router(profile_router)

    @app.on_event("startup")
    async def startup_scheduler() -> None:
        initialize_database()
        with SessionLocal() as db:
            ensure_admin_profile(db, settings, sync_from_env=True)
        if settings.breakfast_scheduler_enabled:
            app.state.breakfast_scheduler_task = asyncio.create_task(breakfast_scheduler_loop())

    @app.on_event("shutdown")
    async def shutdown_scheduler() -> None:
        task = getattr(app.state, "breakfast_scheduler_task", None)
        if task is not None:
            task.cancel()
            with contextlib.suppress(Exception):
                await task

    return app


app = create_app()
